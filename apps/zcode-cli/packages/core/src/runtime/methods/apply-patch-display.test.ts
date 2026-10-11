import assert from "node:assert/strict";
import test from "node:test";
import { SessionEventType, type MessageWithParts } from "@zcode/contracts";
import { toolOutputSchema } from "@zcode/shared/zcode-protocol-v4";
import { createToolResultDisplay } from "../../tool/executor/result-display.js";
import { completedToolPartMetadata } from "./tool-part-metadata.js";
import { synthesizeEventsFromMessages } from "../../../../bootstrap/src/zcode-protocol-v4/transcript-hydration.js";
import { ProductProjection } from "../../../../bootstrap/src/zcode-protocol-v4/product-projection.js";
import { ConversationTopicPublisher } from "../../../../bootstrap/src/zcode-protocol-v4/conversation-topic-publisher.js";

test("partial patch file diffs survive live results and error transcript replay for both delivery profiles", () => {
  const output = {
    status: "partial",
    operations: [],
    files: [],
    structuredPatch: [],
    summary: "partial patch",
    committedChanges: [
      {
        filePath: "/new",
        originalFile: null,
        content: "new\n",
        structuredPatch: [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 1, lines: ["+new"] }],
      },
      {
        filePath: "/gone",
        originalFile: "old\n",
        content: null,
        structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 0, newLines: 0, lines: ["-old"] }],
      },
    ],
  };
  const display = createToolResultDisplay("ApplyPatch", output);
  assert.equal(display?.kind, "file_diffs");
  assert.deepEqual(toolOutputSchema.parse({ text: output.summary, display }).display, display);
  const metadata = completedToolPartMetadata({
    toolName: "ApplyPatch",
    completedAt: new Date(2),
    output,
    display,
  } as never);
  const messages = [
    {
      info: {
        id: "user",
        role: "user",
        sessionID: "session",
        time: { created: 1 },
        agent: "fixture",
      },
      parts: [{ id: "text", type: "text", messageID: "user", sessionID: "session", text: "patch" }],
    },
    {
      info: {
        id: "assistant",
        role: "assistant",
        sessionID: "session",
        parentID: "user",
        agent: "fixture",
        time: { created: 1, completed: 2 },
        mode: "build",
        path: { cwd: "/workspace", root: "/workspace" },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        finish: "stop",
      },
      parts: [
        {
          id: "tool",
          type: "tool",
          messageID: "assistant",
          sessionID: "session",
          callID: "call",
          tool: "ApplyPatch",
          state: {
            status: "error",
            input: {},
            error: output.summary,
            metadata,
            time: { start: 1, end: 2 },
          },
        },
      ],
    },
  ] as MessageWithParts[];
  const coldEvents = synthesizeEventsFromMessages(messages, { sessionId: "session" });
  const coldResult = coldEvents.find((event) => event.type === SessionEventType.ToolCallResult);
  assert.ok(coldResult);
  assert.deepEqual(
    (coldResult.payload as { result: { display?: unknown } }).result.display,
    display,
  );
  const liveEvents = coldEvents.map((event) =>
    event === coldResult
      ? {
          ...event,
          payload: {
            toolCallId: "call",
            duration: 1,
            result: {
              success: false,
              content: output.summary,
              display,
              error: { type: "fault.runtime.toolFailed", message: output.summary },
            },
          },
        }
      : event,
  );
  const live = new ProductProjection("session", "epoch");
  for (const event of liveEvents) live.applyEvent(event);
  const liveTool = live.getSnapshot().rows.window.find((row) => row.kind === "toolCall");
  assert.equal(liveTool?.status, "error");
  assert.deepEqual(liveTool?.output?.display, display);
  const publisher = new ConversationTopicPublisher("session", "epoch");
  publisher.rehydrate(coldEvents);
  for (const deliveryProfile of ["continuous", "replayable"] as const) {
    const frame = publisher.subscribe({ connectionId: deliveryProfile, deliveryProfile }).frame;
    assert.equal(frame?.payload.kind, "snapshot");
    if (frame?.payload.kind !== "snapshot") continue;
    const tool = frame.payload.snapshot.rows.window.find((row) => row.kind === "toolCall");
    assert.equal(tool?.status, "error");
    assert.deepEqual(tool?.output?.display, display);
  }
});
