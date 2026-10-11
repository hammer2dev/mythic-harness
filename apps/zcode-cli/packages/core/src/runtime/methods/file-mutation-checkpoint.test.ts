import assert from "node:assert/strict";
import test from "node:test";
import { parseWorkspaceCheckpointArtifact } from "@zcode/contracts";
import { emitFileMutationCheckpoint } from "./tools.js";
import { buildTurnFileChangeSummary, recordTurnFileChange } from "../helpers/turn-file-changes.js";
import type { RuntimeTurnFileChangeMap } from "../types.js";

const committedChanges = [
  { filePath: "/new", originalFile: null, content: "added\n", structuredPatch: [] },
  { filePath: "/deleted", originalFile: "removed\n", content: null, structuredPatch: [] },
];

test("partial ApplyPatch records all committed paths and preserves missing after-state", async () => {
  let artifactContent = "";
  const events: Array<{ payload: { fileCount: number } }> = [];
  const changes: RuntimeTurnFileChangeMap = new Map();
  const runtime = {
    currentTurnFileChanges: changes,
    sessionId: "session",
    artifactStore: {
      async writeToolResultArtifact(input: { content: string }) {
        artifactContent = input.content;
        return { uri: "artifact:patch" };
      },
    },
    createEvent: (type: string, payload: unknown) => ({ type, payload }),
    appendEvent: async () => {},
  };
  await emitFileMutationCheckpoint.call(
    runtime as never,
    {
      abortSignal: AbortSignal.abort(),
      events,
      messageId: "message",
      result: {
        success: false,
        toolName: "ApplyPatch",
        toolCallId: "call",
        output: { committedChanges },
      },
      traceContext: {},
    } as never,
  );
  const artifact = parseWorkspaceCheckpointArtifact(JSON.parse(artifactContent));
  assert.equal(events[0]?.payload.fileCount, 2);
  assert.equal(artifact.files[1]?.afterContent, null);
  assert.deepEqual(buildTurnFileChangeSummary(changes), {
    additions: 1,
    deletions: 1,
    files: 2,
    items: [
      { additions: 0, deletions: 1, path: "/deleted", toolNames: ["ApplyPatch"], writeCount: 1 },
      { additions: 1, deletions: 0, path: "/new", toolNames: ["ApplyPatch"], writeCount: 1 },
    ],
  });
});

test("artifact failure does not erase committed changes, including deletion after an edit", async () => {
  const changes: RuntimeTurnFileChangeMap = new Map();
  recordTurnFileChange(changes, {
    path: "/deleted",
    beforeContent: "original\n",
    afterContent: "removed\n",
    structuredPatch: [],
    toolName: "Edit",
  });
  const runtime = {
    currentTurnFileChanges: changes,
    sessionId: "session",
    artifactStore: {
      async writeToolResultArtifact() {
        throw new Error("disk unavailable");
      },
    },
  };
  await emitFileMutationCheckpoint.call(
    runtime as never,
    {
      events: [],
      messageId: "message",
      traceContext: {},
      result: {
        success: false,
        toolName: "ApplyPatch",
        toolCallId: "call",
        output: { committedChanges },
      },
    } as never,
  );
  assert.equal(changes.get("/deleted")?.afterContent, null);
  assert.equal(buildTurnFileChangeSummary(changes)?.deletions, 1);
  assert.equal(changes.size, 2);
});
