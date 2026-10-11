import assert from "node:assert/strict";
import test from "node:test";
import { lstat, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createNodeFileSystemAdapter } from "../../../../adapters/src/fs/index.js";
import { writeConditionalTextFile } from "../../../../adapters/src/fs/conditional-write.js";
import {
  ApplyPatchOutputSchema,
  createFileSystemError,
  type ApplyPatchOutput,
  type FileSystemPort,
} from "@zcode/contracts";
import { applyPatchToolEntry } from "./apply-patch.js";
import { createReadFileStateKey } from "../read-file-state.js";
import type { ToolExecutionContext } from "../types.js";
import { PermissionService } from "../../permission/service.js";

async function fixture(
  run: (root: string, fs: FileSystemPort, context: ToolExecutionContext) => Promise<void>,
) {
  const root = await mkdtemp(join(tmpdir(), "apply-patch-"));
  const fs = createNodeFileSystemAdapter();
  const context = {
    toolCallId: "patch-test",
    traceId: "trace-test",
    sessionId: "session-test",
    workingDirectory: root,
    workspaceRoot: root,
    abortSignal: new AbortController().signal,
    fileSystemPort: fs,
    readFileState: new Map(),
  } as unknown as ToolExecutionContext;
  try {
    await run(root, fs, context);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function readForEdit(context: ToolExecutionContext, name: string, content: string) {
  const path = join(context.workingDirectory, name);
  await writeFile(path, content);
  const read = await context.fileSystemPort!.readTextFile({ path });
  context.readFileState!.set(createReadFileStateKey(path, 1, undefined), {
    path,
    content: read.content,
    isPartialView: false,
    readAt: new Date(),
    sourceTool: "Read",
    revisionId: read.revision?.id,
    sizeBytes: read.sizeBytes,
    mtimeMs: read.revision?.mtimeMs,
  });
}

async function execute(context: ToolExecutionContext, body: string): Promise<ApplyPatchOutput> {
  const output = (await applyPatchToolEntry.handler(
    { patch_text: `*** Begin Patch\n${body}\n*** End Patch` },
    context,
  )) as ApplyPatchOutput;
  return ApplyPatchOutputSchema.parse(output);
}

test("preflight failure writes nothing; successful patch records all four operations", async () => {
  await fixture(async (root, _fs, context) => {
    await readForEdit(context, "a", "old\r\n");
    await readForEdit(context, "delete", "obsolete\n");
    await readForEdit(context, "move", "moving\n");
    const failed = await execute(
      context,
      "*** Add File: new\n+created\n*** Update File: a\n@@\n-missing\n+replacement",
    );
    assert.equal(failed.status, "failed");
    await assert.rejects(readFile(join(root, "new")), { code: "ENOENT" });
    const output = await execute(
      context,
      "*** Add File: new\n+created\n*** Update File: a\n@@\n-old\n+updated\n*** Delete File: delete\n*** Update File: move\n*** Move to: moved\n@@\n-moving\n+moved",
    );
    assert.equal(output.status, "completed", output.summary);
    assert.equal(output.committedChanges.length, 5);
    assert.equal(await readFile(join(root, "a"), "utf8"), "updated\r\n");
    await assert.rejects(readFile(join(root, "move")), { code: "ENOENT" });
  });
});

test("move source removal failure keeps target fact and stops subsequent operations", async () => {
  await fixture(async (root, fs, context) => {
    await readForEdit(context, "move", "old\n");
    const originalRemove = fs.removeFile.bind(fs);
    fs.removeFile = async (request, options) => {
      if (request.path === join(root, "move"))
        throw createFileSystemError({
          code: "permission_denied",
          message: "injected removal failure",
        });
      return originalRemove(request, options);
    };
    const result = await execute(
      context,
      "*** Update File: move\n*** Move to: moved\n@@\n-old\n+new\n*** Add File: later\n+later",
    );
    assert.equal(result.status, "partial");
    assert.deepEqual(
      result.operations.map((operation) => operation.status),
      ["failed", "not_attempted"],
    );
    assert.deepEqual(
      result.committedChanges.map((change) => change.filePath),
      [join(root, "moved")],
    );
    assert.equal(await readFile(join(root, "move"), "utf8"), "old\n");
    assert.equal(await readFile(join(root, "moved"), "utf8"), "new\n");
  });
});

test("stale read and create race are rejected without overwriting external changes", async () => {
  await fixture(async (root, fs, context) => {
    await readForEdit(context, "a", "old\n");
    await writeFile(join(root, "a"), "external\n");
    assert.equal((await execute(context, "*** Update File: a\n@@\n-old\n+new")).status, "failed");
    const originalWrite = fs.writeTextFile.bind(fs);
    fs.writeTextFile = async (request, options) => {
      await writeFile(request.path, "raced\n");
      return originalWrite(request, options);
    };
    assert.equal((await execute(context, "*** Add File: new\n+proposed")).status, "failed");
    assert.equal(await readFile(join(root, "new"), "utf8"), "raced\n");
  });
});

test("permission allow covers every path while a denied move destination rejects the patch", () => {
  const input = {
    patch_text:
      "*** Begin Patch\n*** Update File: allowed/a\n*** Move to: private/b\n@@\n-x\n+y\n*** End Patch",
  };
  const rulePolicy = applyPatchToolEntry.resolvePermissionRulePolicy!(input, {
    workingDirectory: process.cwd(),
    workspaceRoot: process.cwd(),
  });
  const service = new PermissionService();
  const permissionContext = {
    toolName: "ApplyPatch",
    input,
    riskLevel: "medium" as const,
    mode: "build" as const,
  };
  const capability = {
    readOnly: false,
    needsApproval: true,
    sideEffectScope: "workspace" as const,
  };
  assert.notEqual(
    service.checkPermission(
      permissionContext,
      capability,
      { version: 1, allow: [{ toolName: "Edit", ruleContent: "allowed/*" }] },
      rulePolicy,
    ).decision,
    "allow",
  );
  assert.equal(
    service.checkPermission(
      permissionContext,
      capability,
      {
        version: 1,
        allow: [{ toolName: "ApplyPatch" }],
        deny: [{ toolName: "Edit", ruleContent: "private/*" }],
      },
      rulePolicy,
    ).decision,
    "deny",
  );
});

test("cancellation after target creation records its effect and stops before source removal", async () => {
  await fixture(async (root, fs, context) => {
    await readForEdit(context, "move", "old\n");
    const controller = new AbortController();
    context.abortSignal = controller.signal;
    const originalWrite = fs.writeTextFile.bind(fs);
    fs.writeTextFile = async (request, options) => {
      const result = await originalWrite(request, options);
      controller.abort(new Error("cancelled after write"));
      return result;
    };
    const output = await execute(
      context,
      "*** Update File: move\n*** Move to: moved\n@@\n-old\n+new\n*** Add File: later\n+later",
    );
    assert.equal(output.status, "partial");
    assert.deepEqual(
      output.committedChanges.map((change) => change.filePath),
      [join(root, "moved")],
    );
    assert.equal(await readFile(join(root, "move"), "utf8"), "old\n");
    assert.equal(output.operations[1]!.status, "not_attempted");
  });
});

test("conditional update and delete validate the revision hash as well as mtime and size", async () => {
  await fixture(async (root, fs, context) => {
    await readForEdit(context, "a", "old\n");
    const path = join(root, "a");
    const read = await fs.readTextFile({ path });
    const expectedRevision = { ...read.revision!, hash: "sha256:previous-content" };
    await assert.rejects(fs.writeTextFile({ path, content: "new\n", expectedRevision }), {
      code: "stale_write",
    });
    await assert.rejects(fs.removeFile({ path, expectedRevision }), { code: "stale_write" });
    assert.equal(await readFile(path, "utf8"), "old\n");
  });
});

test("an I/O error without a success response reports an unconfirmed commit", async () => {
  await fixture(async (root, fs, context) => {
    const originalWrite = fs.writeTextFile.bind(fs);
    fs.writeTextFile = async (request, options) => {
      await originalWrite(request, options);
      throw createFileSystemError({ code: "io_error", message: "commit response lost" });
    };
    const result = await execute(
      context,
      "*** Add File: new\n+created\n*** Add File: later\n+later",
    );
    assert.equal(result.operations[0]!.status, "unconfirmed");
    assert.equal(result.operations[1]!.status, "not_attempted");
    assert.equal(result.committedChanges.length, 0);
    assert.equal(await readFile(join(root, "new"), "utf8"), "created\n");
  });
});

test("symlink sources fail preflight and revision-guarded removal never deletes a replaced link", async () => {
  await fixture(async (root, fs, context) => {
    await readForEdit(context, "source", "original\n");
    const source = join(root, "source");
    const link = join(root, "link");
    await symlink(source, link, "file");
    const result = await execute(context, "*** Add File: new\n+created\n*** Delete File: link");
    assert.equal(result.status, "failed");
    assert.match(result.summary, /regular file/);
    assert.equal((await lstat(link)).isSymbolicLink(), true);
    await assert.rejects(readFile(join(root, "new")), { code: "ENOENT" });
    const read = await fs.readTextFile({ path: source });
    await assert.rejects(fs.removeFile({ path: link, expectedRevision: read.revision }), {
      code: "not_file",
    });
    assert.equal((await lstat(link)).isSymbolicLink(), true);
    assert.equal(await readFile(source, "utf8"), "original\n");
  });
});

test("conditional writes report a custom abort reason as cancelled before committing", async () => {
  await fixture(async (root) => {
    const path = join(root, "cancelled");
    await assert.rejects(
      writeConditionalTextFile({
        path,
        content: Buffer.from("new"),
        expectedMissing: true,
        signal: AbortSignal.abort(new Error("stop")),
      }),
      { code: "cancelled" },
    );
    await assert.rejects(readFile(path), { code: "ENOENT" });
  });
});
