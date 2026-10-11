import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSessionId,
  createModelId,
  createModelProviderId,
  InMemorySessionEventStore,
  type McpPort,
  type Model,
  type ModelRequest,
  type ModelToolCall,
} from "@zcode/contracts";
import { NodeFileSystemAdapter } from "../../../adapters/src/fs/index.js";
import { SqliteSessionStore } from "../../../adapters/src/storage/session-store.js";
import { AgentRuntime } from "./agent-runtime.js";
import type { AgentRuntimeInternal } from "./internal.js";
import {
  getExposedTools,
  runtimeToolExposure,
  searchRuntimeTools,
} from "./helpers/tool-exposure.js";
import { forkConversationFromMessage } from "./methods/session-fork.js";

test("runtime searches ApplyPatch then exposes and executes its schema on the next model step", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tool-search-runtime-"));
  const requests: ModelRequest[] = [];
  const store = new SqliteSessionStore({ dbPath: ":memory:" });
  let estimates = 0;
  const model: Model = {
    providerId: createModelProviderId("test"),
    modelId: createModelId("tool-search"),
    properties: {
      contextWindow: 200000,
      requiresMfjsToolSchema: false,
      supportsToolCall: true,
      supportsJsonSchemaOutput: true,
      supportsNativeWebSearch: false,
      supportsMidConversationSystem: true,
      inputFormat: {
        supportsText: true,
        supportsImage: false,
        supportsVideo: false,
        supportsAudio: false,
        supportsPdf: false,
      },
      outputFormat: { supportsText: true },
    },
    optionSpecs: {
      reasoningLevel: { values: ["none"], map: "reasoningLevel" },
      maxOutputTokens: { max: 4096, map: "maxOutputTokens" },
    },
    options: {},
    estimateToolSchemaTokens: () => {
      estimates += 1;
      return 100;
    },
    bind() {
      return this;
    },
    async generateText(request) {
      requests.push(request);
      let toolCalls: ModelToolCall[] | undefined;
      if (requests.length === 1) {
        assert.ok(request.tools?.some((tool) => tool.name === "ToolSearch"));
        assert.ok(!request.tools?.some((tool) => tool.name === "ApplyPatch"));
        toolCalls = [{ id: "search-1", name: "ToolSearch", input: { query: "ApplyPatch" } }];
      } else if (requests.length === 2) {
        assert.ok(request.tools?.some((tool) => tool.name === "ApplyPatch"));
        toolCalls = [
          {
            id: "patch-1",
            name: "ApplyPatch",
            input: {
              patch_text:
                "*** Begin Patch\n*** Add File: result.txt\n+created through ToolSearch\n*** End Patch",
            },
          },
        ];
      }
      return {
        text: toolCalls ? "" : "done",
        finishReason: toolCalls ? "tool-calls" : "stop",
        toolCalls,
        usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120 },
      };
    },
    streamText() {
      throw new Error("Unexpected streaming request");
    },
  };
  try {
    const runtime = new AgentRuntime(
      createSessionId(),
      {
        workingDirectory: directory,
        mode: "yolo",
        modelStreaming: false,
        modelSelection: { providerId: "test", modelId: "tool-search" },
        toolAllowlist: ["Read", "ToolSearch", "ApplyPatch", "ListModels"],
        subagents: { enabled: false },
        memory: { enabled: false },
        compact: { enabled: false },
      },
      {
        eventStore: new InMemorySessionEventStore(),
        modelFactory: () => model,
        sessionStore: store,
        fileSystemPort: new NodeFileSystemAdapter(),
      },
    );
    const result = await runtime.executeTurn("Create result.txt with ApplyPatch");
    assert.equal(result.response, "done");
    assert.equal(requests.length, 3);
    assert.ok(estimates > 0, "runtime model wrappers must preserve adapter schema estimates");
    assert.equal(
      await readFile(join(directory, "result.txt"), "utf8"),
      "created through ToolSearch\n",
    );
    const toolResults = requests[2]!.messages.filter((message) => message.role === "tool");
    assert.ok(toolResults.length > 0);
    assert.ok(!JSON.stringify(toolResults).includes('"inputSchema"'));
    await runtime.executeTurn("/compact");
    assert.equal(
      requests[3]?.tools?.length,
      0,
      "summary requests must not reload the full registry",
    );
    const resumed = new AgentRuntime(
      runtime.getSessionId(),
      {
        workingDirectory: directory,
        mode: "yolo",
        modelStreaming: false,
        modelSelection: { providerId: "test", modelId: "tool-search" },
        toolAllowlist: ["Read", "ToolSearch", "ApplyPatch", "ListModels"],
        subagents: { enabled: false },
        memory: { enabled: false },
        compact: { enabled: false },
      },
      {
        eventStore: new InMemorySessionEventStore(),
        modelFactory: () => model,
        sessionStore: store,
      },
    );
    await resumed.resumeFromStore();
    await resumed.executeTurn("Continue after cold resume");
    assert.ok(
      requests[4]?.tools?.some((tool) => tool.name === "ApplyPatch"),
      "compact snapshot must preserve used tools across cold resume",
    );
    const resumedInternal = resumed as unknown as AgentRuntimeInternal;
    const forkBoundary = resumedInternal.latestAssistantMessageId!;
    assert.equal(
      searchRuntimeTools(
        resumedInternal,
        { query: "ListModels" },
        {
          model,
          abortSignal: new AbortController().signal,
        },
      ).matches[0]?.status,
      "loaded",
    );
    await resumed.executeTurn("New branch input");
    const fork = await forkConversationFromMessage.call(resumedInternal, {
      targetMessageId: forkBoundary,
      traceContext: resumedInternal.rootTraceContext,
    });
    const forked = new AgentRuntime(
      fork.forkedSessionId,
      { ...resumedInternal.config },
      {
        eventStore: new InMemorySessionEventStore(),
        modelFactory: () => model,
        sessionStore: store,
      },
    );
    await forked.resumeFromStore();
    const forkNames = getExposedTools(forked as unknown as AgentRuntimeInternal, { model }).map(
      (tool) => tool.name,
    );
    assert.ok(forkNames.includes("ApplyPatch"));
    assert.ok(
      !forkNames.includes("ListModels"),
      "fork must use the copied boundary, not the parent's current activation set",
    );
    const branchMessages = await store.messages({ sessionID: resumed.getSessionId() });
    const branchInput = branchMessages.find((message) =>
      message.parts.some((part) => part.type === "text" && part.text === "New branch input"),
    )!;
    const rewind = await resumedInternal.rewindConversationToMessage({
      events: [],
      targetMessageId: branchInput.info.id,
      traceContext: resumedInternal.rootTraceContext,
    });
    assert.equal(rewind.strategy, "active_chain");
    assert.ok(
      !getExposedTools(resumedInternal, { model }).some((tool) => tool.name === "ListModels"),
      "rewind must drop tools activated only on the removed branch",
    );
  } finally {
    store.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("restricted child receives ToolSearch without expanding its original tool eligibility", () => {
  const runtime = new AgentRuntime(
    createSessionId(),
    {
      taskType: "subagent_child",
      toolAllowlist: ["ApplyPatch"],
      subagents: { enabled: false },
    },
    {
      eventStore: new InMemorySessionEventStore(),
      modelFactory: () => {
        throw new Error("No model needed");
      },
    },
  );
  const internal = runtime as unknown as AgentRuntimeInternal;
  assert.deepEqual(
    getExposedTools(internal).map((tool) => tool.name),
    ["ToolSearch"],
  );
  const context = { abortSignal: new AbortController().signal };
  assert.equal(searchRuntimeTools(internal, { query: "WebFetch" }, context).matches.length, 0);
  const found = searchRuntimeTools(internal, { query: "ApplyPatch" }, context);
  assert.equal(found.matches[0]?.status, "loaded");
  assert.deepEqual(
    new Set(getExposedTools(internal).map((tool) => tool.name)),
    new Set(["ToolSearch", "ApplyPatch"]),
  );
  const forbidden = new AgentRuntime(
    createSessionId(),
    {
      taskType: "subagent_child",
      toolAllowlist: ["ApplyPatch"],
      toolDisallowlist: ["ToolSearch"],
      subagents: { enabled: false },
    },
    {
      eventStore: new InMemorySessionEventStore(),
      modelFactory: () => {
        throw new Error("No model needed");
      },
    },
  );
  assert.ok(!forbidden.getTools().some((tool) => tool.name === "ToolSearch"));
});

test("connected MCP tools remain deferred, cancellation does not activate, and revoked tools disappear", async () => {
  let calls = 0;
  const mcp: McpPort = {
    async connectConfiguredServers() {
      return { statuses: {}, tools: [] };
    },
    async connectServer() {
      throw new Error("Already connected");
    },
    async disconnectServer() {
      return undefined;
    },
    async status() {
      return {};
    },
    async listTools() {
      return [
        {
          serverName: "demo",
          toolName: "lookup",
          description: "Look up an item",
          inputSchema: { type: "object", properties: {} },
        },
      ];
    },
    async callTool() {
      calls += 1;
      return { content: [{ type: "text", text: "found" }] };
    },
    async close() {},
  };
  const runtime = new AgentRuntime(
    createSessionId(),
    {
      mode: "yolo",
      toolAllowlist: ["ToolSearch", "mcp__demo__lookup"],
      subagents: { enabled: false },
    },
    {
      eventStore: new InMemorySessionEventStore(),
      mcpPort: mcp,
      modelFactory: () => {
        throw new Error("No model needed");
      },
    },
  );
  const internal = runtime as unknown as AgentRuntimeInternal;
  await internal.initializeMcp(internal.rootTraceContext);
  assert.deepEqual(
    getExposedTools(internal).map((tool) => tool.name),
    ["ToolSearch"],
  );
  const before = runtimeToolExposure(internal).snapshot();
  assert.throws(() =>
    searchRuntimeTools(internal, { query: "lookup" }, { abortSignal: AbortSignal.abort() }),
  );
  assert.deepEqual(runtimeToolExposure(internal).snapshot(), before);
  const found = searchRuntimeTools(
    internal,
    { query: "lookup", source: "mcp", server: "demo" },
    { abortSignal: new AbortController().signal },
  );
  assert.equal(found.matches[0]?.name, "mcp__demo__lookup");
  assert.equal(calls, 0, "search must never execute a matching MCP tool");
  assert.ok(getExposedTools(internal).some((tool) => tool.name === "mcp__demo__lookup"));
  assert.equal(
    (
      await runtime
        .getToolExecutor()
        .execute({ id: "mcp-call", name: "mcp__demo__lookup", input: {} })
    ).success,
    true,
  );
  assert.equal(calls, 1);
  runtime.getToolRegistry().unregister("mcp__demo__lookup");
  internal.invalidateToolCache();
  assert.ok(!getExposedTools(internal).some((tool) => tool.name === "mcp__demo__lookup"));
});
