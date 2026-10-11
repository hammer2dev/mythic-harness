import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createSessionId,
  createFileSystemError,
  HookEventName,
  SessionEventType,
  type ApplyPatchOutput,
  type SessionEvent,
} from "@zcode/contracts";
import { NodeFileSystemAdapter } from "../../../../adapters/src/fs/index.js";
import { PermissionService } from "../../permission/service.js";
import { ToolRegistryImpl } from "../registry.js";
import { applyPatchToolEntry } from "../handlers/apply-patch.js";
import { ToolExecutorImpl } from "./impl.js";

test("partial patch and post-hook failure retain committed facts and failed result events", async () => {
  const directory = await mkdtemp(join(tmpdir(), "patch-executor-"));
  const registry = new ToolRegistryImpl();
  registry.register(applyPatchToolEntry);
  const events: SessionEvent[] = [];
  const fs = new NodeFileSystemAdapter();
  const write = fs.writeTextFile.bind(fs);
  fs.writeTextFile = async (input, options) => {
    if (input.path === join(directory, "failed.txt")) {
      throw createFileSystemError({ code: "permission_denied", message: "injected write failure" });
    }
    return write(input, options);
  };
  const executor = new ToolExecutorImpl({
    registry,
    permissionService: new PermissionService(),
    sessionId: createSessionId(),
    mode: "yolo",
    workingDirectory: directory,
    fileSystemPort: fs,
    emitEvent: async (event) => {
      events.push(event);
    },
    hookRunner: {
      async run(input) {
        if (input.hookEventName === HookEventName.PostToolUseFailure) {
          throw new Error("injected post-hook failure");
        }
        return { additionalContexts: [] };
      },
    },
  });
  try {
    const result = await executor.execute({
      id: "partial",
      name: "ApplyPatch",
      input: {
        patch_text:
          "*** Begin Patch\n*** Add File: applied.txt\n+applied\n*** Add File: failed.txt\n+failed\n*** End Patch",
      },
    });
    assert.equal(result.success, false);
    assert.equal((result.output as ApplyPatchOutput).status, "partial");
    assert.equal((result.output as ApplyPatchOutput).committedChanges.length, 1);
    assert.equal(result.display?.kind, "file_diffs");
    if (result.display?.kind === "file_diffs") {
      assert.deepEqual(
        result.display.files.map((file) => file.filePath),
        [join(directory, "applied.txt")],
      );
    }
    assert.equal(await readFile(join(directory, "applied.txt"), "utf8"), "applied\n");
    assert.match(String(result.modelContent), /applied.txt/);
    assert.match(String(result.modelContent), /injected post-hook failure/);
    const terminal = events.filter((event) => event.type === SessionEventType.ToolCallResult);
    assert.equal(terminal.length, 1);
    assert.equal((terminal[0]!.payload as { result: { success: boolean } }).result.success, false);
    assert.deepEqual(
      (terminal[0]!.payload as { result: { display?: unknown } }).result.display,
      result.display,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("cancellation after a committed write returns the partial result before settling", async () => {
  const directory = await mkdtemp(join(tmpdir(), "patch-cancel-"));
  const controller = new AbortController();
  const registry = new ToolRegistryImpl();
  registry.register(applyPatchToolEntry);
  const fs = new NodeFileSystemAdapter();
  const write = fs.writeTextFile.bind(fs);
  fs.writeTextFile = async (input, options) => {
    const result = await write(input, options);
    controller.abort();
    return result;
  };
  const executor = new ToolExecutorImpl({
    registry,
    permissionService: new PermissionService(),
    sessionId: createSessionId(),
    mode: "yolo",
    workingDirectory: directory,
    fileSystemPort: fs,
    emitEvent: async () => {},
  });
  try {
    const result = await executor.execute(
      {
        id: "cancelled",
        name: "ApplyPatch",
        input: {
          patch_text:
            "*** Begin Patch\n*** Add File: applied.txt\n+applied\n*** Add File: later.txt\n+later\n*** End Patch",
        },
      },
      { signal: controller.signal },
    );
    assert.equal(result.success, false);
    assert.equal(result.error?.code, "apply_patch_partial");
    assert.equal(result.display?.kind, "file_diffs");
    const output = result.output as ApplyPatchOutput;
    assert.equal(output.committedChanges.length, 1);
    assert.equal(output.operations[1]?.status, "not_attempted");
    assert.equal(await readFile(join(directory, "applied.txt"), "utf8"), "applied\n");
    await assert.rejects(readFile(join(directory, "later.txt")), { code: "ENOENT" });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
