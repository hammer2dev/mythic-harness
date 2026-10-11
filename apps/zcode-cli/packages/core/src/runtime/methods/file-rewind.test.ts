import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { structuredPatch } from "diff";
import { RewindScope, SessionEventType } from "@zcode/contracts";
import type { WorkspaceCheckpointArtifact } from "@zcode/contracts";
import { createNodeFileSystemAdapter } from "../../../../adapters/src/fs/index.js";
import { applyWorkspaceFileRewind, previewWorkspaceFileRewind } from "./file-rewind.js";
import {
  getFileMutationCheckpointCandidates,
  stringifyWorkspaceCheckpointArtifact,
} from "../helpers/rewind.js";

async function fixture(
  run: (root: string, runtime: ReturnType<typeof createRuntime>) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "patch-rewind-"));
  try {
    await run(root, createRuntime(root));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function createRuntime(root: string) {
  const files: WorkspaceCheckpointArtifact["files"] = [
    {
      path: join(root, "deleted"),
      existedBefore: true,
      beforeContent: "before\n",
      afterContent: null,
      structuredPatch: [],
    },
    {
      path: join(root, "added"),
      existedBefore: false,
      beforeContent: null,
      afterContent: "added\n",
      structuredPatch: [],
    },
  ];
  const artifact: WorkspaceCheckpointArtifact = {
    version: 1,
    kind: "workspace_file_before_change",
    createdAt: new Date().toISOString(),
    toolCallId: "call",
    toolName: "ApplyPatch",
    files,
  };
  return {
    artifact,
    sessionId: "session",
    workspaceRoot: root,
    rootTraceContext: {},
    fileSystemPort: createNodeFileSystemAdapter(),
    eventStore: {
      async getEvents() {
        return [
          {
            type: SessionEventType.CheckpointCreated,
            payload: {
              checkpointId: "checkpoint",
              messageId: "message",
              scope: RewindScope.Workspace,
              snapshotRef: "artifact:patch",
              fileCount: files.length,
            },
          },
        ];
      },
    },
    artifactStore: {
      async readToolResultArtifact() {
        return { content: JSON.stringify(artifact) };
      },
    },
    createEvent: (type: string, payload: unknown) => ({ type, payload }),
    appendEvent: async () => {},
  };
}

test("multi-file rewind restores deleted files and removes additions; legacy patches still reconstruct", async () => {
  await fixture(async (root, runtime) => {
    await writeFile(join(root, "added"), "added\n");
    const legacy = join(root, "legacy");
    await writeFile(legacy, "new\n");
    runtime.artifact.files.push({
      path: legacy,
      existedBefore: true,
      beforeContent: "old\n",
      structuredPatch: structuredPatch(legacy, legacy, "old\n", "new\n").hunks,
    });
    assert.equal((await previewWorkspaceFileRewind.call(runtime as never)).canApply, true);
    assert.equal((await applyWorkspaceFileRewind.call(runtime as never)).applied, true);
    assert.equal(await readFile(join(root, "deleted"), "utf8"), "before\n");
    assert.equal(await readFile(legacy, "utf8"), "old\n");
    await assert.rejects(readFile(join(root, "added")), { code: "ENOENT" });
  });
});

test("recreated deleted file blocks rewind; a create race preserves the external file and compensates prior writes", async () => {
  await fixture(async (root, runtime) => {
    const deleted = join(root, "deleted");
    const added = join(root, "added");
    await writeFile(added, "added\n");
    await writeFile(deleted, "external\n");
    const preview = await previewWorkspaceFileRewind.call(runtime as never);
    assert.equal(preview.canApply, false);
    assert.equal(preview.unsafeFiles[0]?.reason, "external_modified");
    await rm(deleted);
    const originalWrite = runtime.fileSystemPort.writeTextFile.bind(runtime.fileSystemPort);
    runtime.fileSystemPort.writeTextFile = async (request, options) => {
      if (request.path === deleted) await writeFile(deleted, "raced\n");
      return originalWrite(request, options);
    };
    assert.equal((await applyWorkspaceFileRewind.call(runtime as never)).applied, false);
    assert.equal(await readFile(deleted, "utf8"), "raced\n");
    assert.equal(await readFile(added, "utf8"), "added\n");
  });
});

test("checkpoint rewind and failed-rewind compensation preserve GBK bytes and CRLF", async () => {
  await fixture(async (root, runtime) => {
    const path = join(root, "legacy.txt");
    const originalBytes = Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0x0d, 0x0a]);
    const changedBytes = Buffer.from([0xd0, 0xde, 0xb8, 0xc4, 0x0d, 0x0a]);
    const result = {
      toolName: "ApplyPatch",
      toolCallId: "call",
      success: true,
      output: {
        committedChanges: [
          {
            filePath: path,
            originalFile: "中文\n",
            content: "修改\n",
            structuredPatch: [],
            beforeEncoding: "gbk",
            beforeLineEndings: "CRLF",
          },
        ],
      },
    };
    runtime.artifact = JSON.parse(
      stringifyWorkspaceCheckpointArtifact(
        getFileMutationCheckpointCandidates(result as never),
        result as never,
      ),
    );
    runtime.artifactStore.readToolResultArtifact = async () => ({
      content: JSON.stringify(runtime.artifact),
    });
    await writeFile(path, changedBytes);
    assert.equal((await applyWorkspaceFileRewind.call(runtime as never)).applied, true);
    assert.deepEqual(await readFile(path), originalBytes);

    await writeFile(path, changedBytes);
    const failed = await applyWorkspaceFileRewind.call(runtime as never, {
      commitAfterApply: async () => {
        throw new Error("injected branch commit failure");
      },
    });
    assert.equal(failed.applied, false);
    assert.deepEqual(await readFile(path), changedBytes);
  });
});
