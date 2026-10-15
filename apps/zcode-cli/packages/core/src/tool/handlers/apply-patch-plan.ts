import {
  isFileSystemPortError,
  type ApplyPatchCommittedChange,
  type FileSystemPort,
  type FileSystemReadTextResult,
} from "@zcode/contracts";
import { resolveWorkspacePath } from "../path-policy.js";
import {
  createReadFileStateKey,
  findLatestReadFileState,
  normalizeReadFileStateMtimeMs,
} from "../read-file-state.js";
import { normalizeToolPathForComparison } from "../path-normalization.js";
import type { ToolExecutionContext } from "../types.js";
import { applyPatchHunks, type PatchOperation } from "./apply-patch-parser.js";

export interface PatchPlanItem extends PatchOperation {
  read?: FileSystemReadTextResult;
}

export function resolvePatchPaths(
  operations: PatchOperation[],
  context: Pick<ToolExecutionContext, "workingDirectory" | "workspaceRoot">,
): PatchPlanItem[] {
  const seen = new Set<string>();
  const resolvePath = (inputPath: string) => {
    const path = resolveWorkspacePath({ ...context, inputPath, operation: "write" });
    const key = pathKey(path);
    if (seen.has(key)) throw new Error(`Patch target appears more than once: ${path}`);
    seen.add(key);
    return path;
  };
  return operations.map((operation) => ({
    ...operation,
    path: resolvePath(operation.path),
    ...(operation.movePath ? { movePath: resolvePath(operation.movePath) } : {}),
  }));
}

export async function preflightPatchItem(
  item: PatchPlanItem,
  fs: FileSystemPort,
  context: ToolExecutionContext,
): Promise<void> {
  context.abortSignal.throwIfAborted();
  if (item.type === "add") {
    await assertMissing(fs, item.path);
    return;
  }
  const info = await fs.stat({
    path: item.path,
    followSymlinks: false,
    trace: context.traceContext,
  });
  // 链接本体没有文本快照，不能用目标内容伪造删除/移动前的可恢复状态。
  if (info.kind !== "file") throw new Error(`ApplyPatch requires a regular file: ${item.path}`);
  const read = await fs.readTextFile(
    { path: item.path, trace: context.traceContext },
    { signal: context.abortSignal },
  );
  const lastRead = findLatestReadFileState(context.readFileState, item.path);
  // 足量 limit 也能读到全文；保留起始位置与 token 截断检查，再以下方全文及 revision 比较确认完整性。
  if (!lastRead || lastRead.isPartialView || (lastRead.offset ?? 1) > 1) {
    throw new Error(`Read the whole file before applying a patch: ${item.path}`);
  }
  if (
    read.truncated ||
    !read.revision ||
    lastRead.content !== read.content ||
    (lastRead.revisionId && lastRead.revisionId !== read.revision.id)
  ) {
    throw new Error(`File changed since Read; read it again before applying a patch: ${item.path}`);
  }
  if (read.content.includes("\0"))
    throw new Error(`ApplyPatch supports text files only: ${item.path}`);
  item.read = read;
  if (item.movePath) await assertMissing(fs, item.movePath);
  if (item.type !== "delete") item.content = applyPatchHunks(read.content, item.hunks);
}

async function assertMissing(fs: FileSystemPort, path: string): Promise<void> {
  try {
    await fs.stat({ path, followSymlinks: false });
  } catch (error) {
    if (isFileSystemPortError(error) && error.code === "not_found") return;
    throw error;
  }
  throw new Error(`Patch destination already exists: ${path}`);
}

export function updatePatchReadState(
  context: ToolExecutionContext,
  change: ApplyPatchCommittedChange,
): void {
  const state = context.readFileState;
  if (!state) return;
  for (const [key, entry] of state) {
    if (pathKey(entry.path) === pathKey(change.filePath)) state.delete(key);
  }
  if (change.content === null) return;
  state.set(createReadFileStateKey(change.filePath, 1, undefined), {
    path: change.filePath,
    content: change.content,
    isPartialView: false,
    readAt: new Date(),
    sourceTool: "ApplyPatch",
    revisionId: change.afterRevision?.id,
    mtimeMs: normalizeReadFileStateMtimeMs(change.afterRevision?.mtimeMs),
    sizeBytes: change.afterRevision?.sizeBytes ?? Buffer.byteLength(change.content, "utf8"),
  });
}

function pathKey(path: string): string {
  const normalized = normalizeToolPathForComparison(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
