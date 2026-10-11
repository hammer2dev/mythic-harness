import assert from "node:assert/strict";
import test from "node:test";
import { structuredPatch } from "diff";
import { RewindScope, SessionEventType } from "@zcode/contracts";
import type { SessionEvent, WorkspaceCheckpointArtifact } from "@zcode/contracts";
import {
  buildColdFileChangeSummaries,
  readConversationFileChangesFromEvents,
} from "../../../../bootstrap/src/zcode-protocol-v4/cold-file-change-summaries.js";
import { buildTurnFileChangeSummary, recordTurnFileChange } from "../helpers/turn-file-changes.js";
import type { RuntimeTurnFileChangeMap } from "../types.js";

test("edit followed by delete has the same final deletion in live, cold, and conversation summaries", async () => {
  const path = "/workspace/removed.ts";
  const changes = [
    { beforeContent: "original\n", afterContent: "intermediate\nextra\n", toolName: "Edit" },
    { beforeContent: "intermediate\nextra\n", afterContent: null, toolName: "ApplyPatch" },
  ];
  const live: RuntimeTurnFileChangeMap = new Map();
  const artifacts = new Map<string, string>();
  const events: SessionEvent[] = [];
  for (const [index, change] of changes.entries()) {
    const hunks = structuredPatch(
      path,
      path,
      change.beforeContent,
      change.afterContent ?? "",
    ).hunks;
    recordTurnFileChange(live, { ...change, path, structuredPatch: hunks });
    const snapshotRef = `artifact:${index}`;
    const artifact: WorkspaceCheckpointArtifact = {
      version: 1,
      kind: "workspace_file_before_change",
      createdAt: new Date().toISOString(),
      toolCallId: `call:${index}`,
      toolName: change.toolName,
      files: [
        {
          path,
          existedBefore: true,
          beforeContent: change.beforeContent,
          afterContent: change.afterContent,
          structuredPatch: hunks,
        },
      ],
    };
    artifacts.set(snapshotRef, JSON.stringify(artifact));
    events.push({
      type: SessionEventType.CheckpointCreated,
      turnId: "turn",
      payload: {
        checkpointId: `checkpoint:${index}`,
        messageId: "message",
        targetMessageId: "message",
        scope: RewindScope.Workspace,
        snapshotRef,
        fileCount: 1,
      },
    } as SessionEvent);
  }
  const input = {
    events,
    messageIds: ["message"],
    readArtifact: async (ref: string) => artifacts.get(ref)!,
  };
  const cold = await buildColdFileChangeSummaries(input);
  const conversation = await readConversationFileChangesFromEvents(input);
  const expected = {
    additions: 0,
    deletions: 1,
    files: 1,
    items: [{ path, additions: 0, deletions: 1, writeCount: 2, toolNames: ["ApplyPatch", "Edit"] }],
  };
  assert.deepEqual(buildTurnFileChangeSummary(live), expected);
  assert.deepEqual(cold.get("message"), expected);
  assert.deepEqual(
    { ...conversation, items: conversation.items.map(({ patches: _patches, ...item }) => item) },
    expected,
  );
  assert.deepEqual(
    conversation.items[0]?.patches.flatMap((hunk) => hunk.lines),
    ["-original"],
  );
});
