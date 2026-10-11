import { createHash, randomUUID } from "node:crypto";
import { link, lstat, open, readFile, rename, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  createFileSystemError,
  type FileSystemRevision,
  type FileSystemWriteTextResult,
} from "@zcode/contracts";
import { maybeThrowStorageFsFault } from "../storage/fs-fault-injection.js";

export async function assertFileRevision(
  path: string,
  expected: FileSystemRevision,
): Promise<void> {
  const info = await lstat(path);
  // 删除/移动若跟随链接读取 revision，恢复会把原链接误写成普通文件。
  if (!info.isFile()) {
    throw createFileSystemError({
      code: "not_file",
      path,
      message: `Patch target must be a regular file: ${path}`,
    });
  }
  const id = `mtime:${Math.trunc(info.mtimeMs)}:size:${info.size}`;
  // 仅比较毫秒和大小会漏掉同大小、同时间戳的外部修改，已有 hash 时必须核对内容。
  if (id !== expected.id || (expected.hash && hash(await readFile(path)) !== expected.hash)) {
    throw createFileSystemError({
      code: "stale_write",
      path,
      message: `File changed since it was read: ${path}`,
    });
  }
}

export async function writeConditionalTextFile(input: {
  path: string;
  content: Buffer;
  mode?: number;
  expectedRevision?: FileSystemRevision;
  expectedMissing?: boolean;
  signal?: AbortSignal;
}): Promise<FileSystemWriteTextResult> {
  const { path, content } = input;
  const temporary = join(dirname(path), `.zcode-patch-${randomUUID()}.tmp`);
  let createdTemporary = false;
  try {
    assertNotCancelled(input.signal, path);
    let mode = input.mode;
    if (!input.expectedMissing) {
      const info = await lstat(path);
      if (!info.isFile())
        throw createFileSystemError({
          code: "not_file",
          path,
          message: `Patch target must be a regular file: ${path}`,
        });
      mode ??= info.mode;
    }
    maybeThrowStorageFsFault({ operation: "writeFile", path });
    const handle = await open(temporary, "wx", mode);
    createdTemporary = true;
    let revision: FileSystemRevision;
    try {
      await handle.writeFile(content);
      if (mode !== undefined) await handle.chmod(mode);
      await handle.sync();
      const info = await handle.stat();
      revision = {
        id: `mtime:${Math.trunc(info.mtimeMs)}:size:${info.size}`,
        mtimeMs: info.mtimeMs,
        sizeBytes: info.size,
        hash: hash(content),
      };
    } finally {
      await handle.close();
    }
    assertNotCancelled(input.signal, path);
    if (input.expectedRevision) await assertFileRevision(path, input.expectedRevision);
    if (input.expectedMissing) {
      // link 的排他创建保证预检后出现的目标不会被 rename 覆盖；临时文件与目标在同一目录。
      try {
        await link(temporary, path);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "EEXIST") {
          throw createFileSystemError({
            code: "stale_write",
            path,
            message: `Patch destination already exists: ${path}`,
            cause: error,
          });
        }
        throw error;
      }
    } else {
      await rename(temporary, path);
      createdTemporary = false;
    }
    return { path, bytesWritten: content.byteLength, revision };
  } finally {
    // 提交已成功时清理失败不应把真实写入伪装为失败，更不能触发原地重写兜底。
    if (createdTemporary) await unlink(temporary).catch(() => undefined);
  }
}

function hash(content: Buffer): string {
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}

function assertNotCancelled(signal: AbortSignal | undefined, path: string): void {
  // 自定义 abort reason 可能只是普通 Error；这里发生在提交前，应明确标为取消而非未知 I/O。
  if (signal?.aborted)
    throw createFileSystemError({
      code: "cancelled",
      path,
      message: `File system operation was cancelled: ${path}`,
    });
}
