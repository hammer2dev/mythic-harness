import assert from "node:assert/strict";
import test from "node:test";
import { join } from "node:path";
import { hydrateReadFileStateFromSession } from "./read-file-state-hydrator.js";
import { completedToolPartMetadata } from "../runtime/methods/tool-part-metadata.js";
import { createReadFileStateKey } from "../tool/read-file-state.js";
import type { ReadFileStateMap } from "../tool/types.js";

test("cold resume replays partial ApplyPatch read-state without replaying file mutations", async () => {
  const removedPath = join(process.cwd(), "removed.ts");
  const newPath = join(process.cwd(), "new.ts");
  const metadata = completedToolPartMetadata({
    toolName: "ApplyPatch",
    completedAt: new Date(100),
    output: {
      status: "partial",
      operations: [],
      files: [],
      structuredPatch: [],
      summary: "partial",
      committedChanges: [
        { filePath: removedPath, originalFile: "before", content: null, structuredPatch: [] },
        {
          filePath: newPath,
          originalFile: null,
          content: "new",
          structuredPatch: [],
          afterRevision: { id: "revision-new", mtimeMs: 90, sizeBytes: 3 },
        },
      ],
    },
  } as never);
  const readFileState: ReadFileStateMap = new Map();
  await hydrateReadFileStateFromSession({
    readFileState,
    workingDirectory: process.cwd(),
    workspaceRoot: process.cwd(),
    messages: [
      {
        info: { id: "assistant", role: "assistant" },
        parts: [
          {
            id: "read",
            type: "tool",
            tool: "Read",
            state: {
              status: "completed",
              input: {},
              output: "before",
              metadata: {
                readFileState: {
                  schemaVersion: 1,
                  tool: "Read",
                  path: removedPath,
                  content: "before",
                  isPartialView: false,
                  readAtMs: 1,
                  revisionId: "old",
                  mtimeMs: 1,
                  sizeBytes: 6,
                },
              },
            },
          },
          {
            id: "patch",
            type: "tool",
            tool: "ApplyPatch",
            state: { status: "error", input: {}, metadata },
          },
        ],
      },
    ] as never,
  });
  assert.equal(readFileState.size, 1);
  assert.equal(readFileState.has(createReadFileStateKey(removedPath, 1, undefined)), false);
  const restored = readFileState.get(createReadFileStateKey(newPath, 1, undefined));
  assert.equal(restored?.content, "new");
  assert.equal(restored?.revisionId, "revision-new");
  assert.equal(restored?.sourceTool, "ApplyPatch");
});
