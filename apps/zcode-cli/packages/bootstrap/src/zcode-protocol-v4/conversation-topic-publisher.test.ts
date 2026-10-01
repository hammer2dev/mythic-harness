import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createMessageId,
  createPartId,
  createSessionId,
  type MessageWithParts,
  type TurnInputIntentMetadata,
} from "@zcode/contracts";
import { ConversationTopicPublisher } from "./conversation-topic-publisher.js";
import { ProductProjection } from "./product-projection.js";
import { synthesizeEventsFromMessages } from "./transcript-hydration.js";

const SESSION_ID = createSessionId("session-history-fixture");
const USER_MESSAGE_ID = createMessageId("message-user-fixture");
const ASSISTANT_MESSAGE_ID = createMessageId("message-assistant-fixture");
const LOG_EPOCH = "history-fixture-epoch";
const PROJECT_ID = "history-fixture-project";
const STARTED_AT = 1_000;
const COMPLETED_AT = 2_000;
const PRIMARY_DIRECTORY = join(tmpdir(), "zcode-history-fixture", "primary");
const ASSISTANT_TEXT = "已完成示例任务。";
const REASONING_TEXT = "先检查示例文件，再给出结果。";
const TOOL_OUTPUT = "示例文件内容";

function persistedMessages(
  intentFields: Pick<TurnInputIntentMetadata, "projectWorkspace" | "sharedContextRefs">,
): MessageWithParts[] {
  const inputIntent: TurnInputIntentMetadata = {
    sourceCommandId: "history-fixture-command",
    queueItemId: "history-fixture-input",
    clientId: "history-fixture-client",
    kind: "sendText",
    admissionSeq: 1,
    admittedAt: STARTED_AT,
    requestedDelivery: "startNow",
    admittedDelivery: "startNow",
    ...intentFields,
  };
  return [
    {
      info: {
        id: USER_MESSAGE_ID,
        sessionID: SESSION_ID,
        role: "user",
        time: { created: STARTED_AT },
        agent: "fixture-agent",
        metadata: { inputIntent },
      },
      parts: [
        {
          id: createPartId("part-user-fixture"),
          sessionID: SESSION_ID,
          messageID: USER_MESSAGE_ID,
          type: "text",
          text: "检查示例文件。",
        },
      ],
    },
    {
      info: {
        id: ASSISTANT_MESSAGE_ID,
        sessionID: SESSION_ID,
        role: "assistant",
        parentID: USER_MESSAGE_ID,
        time: { created: STARTED_AT, completed: COMPLETED_AT },
        agent: "fixture-agent",
        mode: "build",
        path: { cwd: PRIMARY_DIRECTORY, root: PRIMARY_DIRECTORY },
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
        finish: "stop",
      },
      parts: [
        {
          id: createPartId("part-reasoning-fixture"),
          sessionID: SESSION_ID,
          messageID: ASSISTANT_MESSAGE_ID,
          type: "reasoning",
          text: REASONING_TEXT,
          time: { start: STARTED_AT, end: COMPLETED_AT },
        },
        {
          id: createPartId("part-tool-fixture"),
          sessionID: SESSION_ID,
          messageID: ASSISTANT_MESSAGE_ID,
          type: "tool",
          callID: "history-fixture-read",
          tool: "Read",
          state: {
            status: "completed",
            input: { file_path: join(PRIMARY_DIRECTORY, "example.txt") },
            output: TOOL_OUTPUT,
            title: "Read",
            metadata: {},
            time: { start: STARTED_AT, end: COMPLETED_AT },
          },
        },
        {
          id: createPartId("part-assistant-fixture"),
          sessionID: SESSION_ID,
          messageID: ASSISTANT_MESSAGE_ID,
          type: "text",
          text: ASSISTANT_TEXT,
        },
      ],
    },
  ];
}

test("带项目快照的批量历史恢复保留助手内容与两种订阅快照", () => {
  const events = synthesizeEventsFromMessages(
    persistedMessages({
      projectWorkspace: {
        projectId: PROJECT_ID,
        name: "示例项目",
        primaryDirectory: PRIMARY_DIRECTORY,
        directories: [PRIMARY_DIRECTORY, join(tmpdir(), "zcode-history-fixture", "extra")],
      },
    }),
    { sessionId: SESSION_ID },
  );
  const baseline = new ProductProjection(SESSION_ID, LOG_EPOCH);
  for (const event of events) baseline.applyEvent(event);
  const expected = baseline.getSnapshot();
  assert.equal(
    expected.rows.window.find((row) => row.kind === "assistantText")?.text,
    ASSISTANT_TEXT,
  );
  assert.equal(expected.rows.window.find((row) => row.kind === "reasoning")?.text, REASONING_TEXT);
  assert.equal(
    expected.rows.window.find((row) => row.kind === "toolCall")?.output?.text,
    TOOL_OUTPUT,
  );

  const publisher = new ConversationTopicPublisher(SESSION_ID, LOG_EPOCH);
  publisher.rehydrate(events);
  const restored = publisher.getSnapshot();
  assert.deepEqual(restored.rows, expected.rows);
  assert.equal(restored.meta.projectId, PROJECT_ID);
  assert.equal(restored.control.phase, "completedSuccess");
  assert.equal(publisher.getDroppedContentStreamEventCount(), 0);

  for (const deliveryProfile of ["continuous", "replayable"] as const) {
    const frame = publisher.subscribe({ connectionId: deliveryProfile, deliveryProfile }).frame;
    assert.ok(frame?.payload.kind === "snapshot");
    assert.deepEqual(frame.payload.snapshot.rows, expected.rows);
    assert.equal(frame.payload.snapshot.meta.projectId, PROJECT_ID);
    assert.equal(frame.payload.snapshot.control.phase, "completedSuccess");
  }
});

test("批量恢复附加共享上下文后继续接纳助手正文", () => {
  const contextId = "history-fixture-context";
  const messages = persistedMessages({
    sharedContextRefs: [{ kind: "shared_context_import", context_id: contextId }],
  });
  messages[1]!.parts = messages[1]!.parts.filter((part) => part.type === "text");
  const events = synthesizeEventsFromMessages(messages, { sessionId: SESSION_ID });
  const projection = new ProductProjection(SESSION_ID, LOG_EPOCH);
  projection.seedSharedContextImport({
    contextId,
    title: "示例共享上下文",
    shareUrl: "https://example.com/cn/share/fixture",
    status: "pending",
  });
  projection.beginHydrationReplay();
  for (const event of events) projection.applyHydrationEvent(event);
  projection.completeHydrationReplay();

  const restored = projection.getSnapshot();
  assert.ok(restored.sharedContextImport && "status" in restored.sharedContextImport);
  assert.equal(restored.sharedContextImport.status, "attached");
  assert.equal(
    restored.rows.window.find((row) => row.kind === "assistantText")?.text,
    ASSISTANT_TEXT,
  );
  assert.equal(restored.control.phase, "completedSuccess");
  assert.equal(projection.getDroppedContentStreamEventCount(), 0);
});
