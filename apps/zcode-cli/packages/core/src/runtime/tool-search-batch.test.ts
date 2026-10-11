import assert from "node:assert/strict";
import test from "node:test";
import {
  createSessionId,
  createTurnId,
  InMemorySessionEventStore,
  ToolSearchOutputSchema,
  type Model,
} from "@zcode/contracts";
import { toolSearchToolEntry } from "../tool/handlers/tool-search.js";
import { AgentRuntime } from "./agent-runtime.js";
import type { AgentRuntimeInternal } from "./internal.js";
import { getExposedTools, searchRuntimeTools } from "./helpers/tool-exposure.js";

test("an earlier call in the same batch is protected before terminal parts are persisted", async () => {
  const runtime = new AgentRuntime(
    createSessionId(),
    {
      mode: "yolo",
      toolAllowlist: ["ToolSearch"],
      toolSearch: { schemaTokenBudget: 6 },
      subagents: { enabled: false },
    },
    {
      eventStore: new InMemorySessionEventStore(),
      modelFactory: () => {
        throw new Error("No model request");
      },
    },
  );
  const internal = runtime as unknown as AgentRuntimeInternal;
  let alphaCalls = 0;
  for (const name of ["Alpha", "Beta"]) {
    runtime.getToolRegistry().register({
      ...toolSearchToolEntry,
      metadata: { ...toolSearchToolEntry.metadata, name, description: name },
      handler: async () => {
        if (name === "Alpha") alphaCalls += 1;
        return {};
      },
      inputSchema: { type: "object", properties: {} },
      outputSchema: { type: "object" },
      runtimeInputSchema: undefined,
      runtimeOutputSchema: undefined,
    });
  }
  const model = {
    estimateToolSchemaTokens: (tools) =>
      tools.reduce((sum, tool) => sum + (tool.name === "ToolSearch" ? 2 : 4), 0),
  } as Model;
  const oldTurn = createTurnId();
  getExposedTools(internal, { model, turnId: oldTurn });
  searchRuntimeTools(
    internal,
    { query: "Alpha" },
    { model, turnId: oldTurn, abortSignal: new AbortController().signal },
  );
  const nextTurn = createTurnId();
  getExposedTools(internal, { model, turnId: nextTurn });
  const results = await runtime.getToolExecutor().executeBatch(
    [
      { id: "alpha", name: "Alpha", input: {} },
      { id: "search-beta", name: "ToolSearch", input: { query: "Beta" } },
    ],
    { maxConcurrency: 1, model, traceContext: { ...internal.rootTraceContext, turnId: nextTurn } },
  );
  assert.equal(alphaCalls, 1);
  assert.ok(results.every((result) => result.success));
  assert.equal(
    ToolSearchOutputSchema.parse(results[1]!.output).matches[0]?.status,
    "budget_exceeded",
  );
  assert.deepEqual(
    new Set(getExposedTools(internal, { model }).map((tool) => tool.name)),
    new Set(["ToolSearch", "Alpha"]),
  );
});
