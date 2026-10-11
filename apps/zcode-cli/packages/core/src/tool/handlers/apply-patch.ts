import {
  ApplyPatchInputJsonSchema,
  ApplyPatchInputSchema,
  ApplyPatchOutputJsonSchema,
  ApplyPatchOutputSchema,
  CoreErrorType,
  isFileSystemPortError,
  type ApplyPatchCommittedChange,
  type ApplyPatchOperationResult,
  type ApplyPatchOutput,
  type FileSystemPort,
  type FileSystemReadTextResult,
  type FileSystemRevision,
} from "@zcode/contracts";
import { countPatchLines, createStructuredPatch } from "../diff.js";
import type { ToolEntry, ToolExecutionContext } from "../types.js";
import { parseApplyPatch } from "./apply-patch-parser.js";
import {
  preflightPatchItem,
  resolvePatchPaths,
  updatePatchReadState,
  type PatchPlanItem,
} from "./apply-patch-plan.js";
import { resolveApplyPatchPermissionRulePolicy } from "./apply-patch-permission.js";

async function applyPatch(
  input: unknown,
  context: ToolExecutionContext,
): Promise<ApplyPatchOutput> {
  const output: ApplyPatchOutput = {
    status: "failed",
    operations: [],
    committedChanges: [],
    files: [],
    structuredPatch: [],
    summary: "",
  };
  let plan: PatchPlanItem[];
  let current = 0;
  try {
    plan = resolvePatchPaths(
      parseApplyPatch(ApplyPatchInputSchema.parse(input).patch_text),
      context,
    );
    output.operations = plan.map((item) => ({
      filePath: item.path,
      type: item.type,
      ...(item.movePath ? { movePath: item.movePath } : {}),
      status: "not_attempted",
    }));
    if (!context.fileSystemPort) throw new Error("FileSystemPort is not configured for ApplyPatch");
    for (const [index, item] of plan.entries()) {
      current = index;
      await preflightPatchItem(item, context.fileSystemPort, context);
    }
  } catch (error) {
    if (output.operations[current]) failOperation(output.operations[current]!, error);
    return completeOutput(output, `Preflight failed: ${errorMessage(error)}`);
  }

  for (const [index, item] of plan.entries()) {
    // 两项提交之间收到取消时，下一项尚未尝试，不能记成文件提交失败。
    if (context.abortSignal.aborted)
      return completeOutput(output, "Cancelled before the next operation");
    try {
      await commitItem(item, context.fileSystemPort!, context, (change) => {
        output.committedChanges.push(change);
        updatePatchReadState(context, change);
      });
      output.operations[index]!.status = "applied";
    } catch (error) {
      failOperation(output.operations[index]!, error);
      return completeOutput(output, `Stopped at ${item.path}: ${errorMessage(error)}`);
    }
  }
  return completeOutput(output);
}

async function commitItem(
  item: PatchPlanItem,
  fs: FileSystemPort,
  context: ToolExecutionContext,
  record: (change: ApplyPatchCommittedChange) => void,
): Promise<void> {
  const signal = { signal: context.abortSignal };
  const trace = context.traceContext;
  if (item.type === "delete") {
    await commitIO(() =>
      fs.removeFile({ path: item.path, expectedRevision: item.read!.revision, trace }, signal),
    );
    record(
      makeChange(item.path, item.read!.content, null, item.read!.revision, undefined, item.read),
    );
    return;
  }
  if (item.type === "move") {
    // 目标先排他创建；源删除失败时必须保留目标新增事实，而不是把整次移动标成未发生。
    const currentInfo = await fs.stat({ path: item.path, followSymlinks: false, trace });
    if (currentInfo.kind !== "file")
      throw new Error(`ApplyPatch requires a regular file: ${item.path}`);
    const currentRead = await fs.readTextFile({ path: item.path, trace }, signal);
    if (
      currentRead.revision?.id !== item.read!.revision?.id ||
      currentRead.revision?.hash !== item.read!.revision?.hash
    )
      throw new Error(`Move source changed since preflight: ${item.path}`);
  }
  const target = item.movePath ?? item.path;
  const created = item.type === "add" || item.type === "move";
  const written = await commitIO(() =>
    fs.writeTextFile(
      {
        path: target,
        content: item.content!,
        createParents: true,
        atomic: true,
        expectedMissing: created,
        expectedRevision: created ? undefined : item.read!.revision,
        encoding: item.read?.encoding,
        lineEndings: item.read?.lineEndings,
        // 移动的目标是新文件，必须继承源权限，不能让默认 umask 抹掉脚本执行位。
        mode: item.type === "move" ? item.read?.mode : undefined,
        trace,
      },
      signal,
    ),
  );
  record(
    makeChange(
      target,
      created ? null : item.read!.content,
      item.content!,
      created ? undefined : item.read!.revision,
      written.revision,
      created ? undefined : item.read,
    ),
  );
  if (item.type === "move") {
    await commitIO(() =>
      fs.removeFile({ path: item.path, expectedRevision: item.read!.revision, trace }, signal),
    );
    record(
      makeChange(item.path, item.read!.content, null, item.read!.revision, undefined, item.read),
    );
  }
}

function makeChange(
  filePath: string,
  originalFile: string | null,
  content: string | null,
  beforeRevision?: FileSystemRevision,
  afterRevision?: FileSystemRevision,
  beforeText?: Pick<FileSystemReadTextResult, "encoding" | "lineEndings" | "mode">,
): ApplyPatchCommittedChange {
  return {
    filePath,
    originalFile,
    content,
    beforeRevision,
    afterRevision,
    ...(beforeText
      ? {
          beforeEncoding: beforeText.encoding,
          beforeLineEndings: beforeText.lineEndings,
          beforeMode: beforeText.mode,
        }
      : {}),
    structuredPatch: createStructuredPatch({
      filePath,
      oldContent: originalFile ?? "",
      newContent: content ?? "",
    }),
  };
}

function failOperation(operation: ApplyPatchOperationResult, error: unknown): void {
  operation.status = error instanceof UnconfirmedPatchCommitError ? "unconfirmed" : "failed";
  operation.reason = errorMessage(error);
}

class UnconfirmedPatchCommitError extends Error {}

async function commitIO<T>(commit: () => Promise<T>): Promise<T> {
  try {
    return await commit();
  } catch (error) {
    if (isFileSystemPortError(error) && error.code !== "io_error") throw error;
    // 未知 I/O 异常可能发生在提交之后，不能把缺失成功响应等同于文件未变。
    throw new UnconfirmedPatchCommitError(
      `${errorMessage(error)}; inspect the affected paths before retrying`,
    );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function completeOutput(output: ApplyPatchOutput, reason?: string): ApplyPatchOutput {
  const completed =
    output.operations.length > 0 &&
    output.operations.every((operation) => operation.status === "applied");
  output.status = completed ? "completed" : output.committedChanges.length ? "partial" : "failed";
  output.files = output.committedChanges.map((change) => ({
    filePath: change.filePath,
    type: change.content === null ? "delete" : change.originalFile === null ? "add" : "update",
    structuredPatch: change.structuredPatch,
    ...countPatchLines(change.structuredPatch),
  }));
  output.structuredPatch = output.committedChanges.flatMap((change) => change.structuredPatch);
  output.summary = `ApplyPatch ${output.status}: ${output.operations.filter((operation) => operation.status === "applied").length}/${output.operations.length} operations applied, ${output.committedChanges.length} paths changed.${reason ? ` ${reason}` : ""}`;
  return output;
}

export const applyPatchToolEntry: ToolEntry = {
  capability:
    "Apply a structured text patch to multiple files with full preflight and explicit partial results",
  metadata: {
    name: "ApplyPatch",
    description:
      "Apply multiple text-file additions, updates, deletions and moves. Read every existing source file first. Format: *** Begin Patch, *** Add File: path (lines prefixed +), *** Update File: path (optional *** Move to: path), @@ hunks (space=context, -=remove, +=add), *** Delete File: path, *** End Patch. Hunk context must match uniquely and exactly. Existing destination files are never overwritten. All operations are preflighted before committing in order; failure stops subsequent operations without rolling back completed changes.",
    readOnly: false,
    destructive: true,
    concurrentSafe: false,
    timeoutMs: 30000,
    maxOutputBytes: 1_000_000,
    sideEffectScope: "workspace",
    riskLevel: "medium",
    needsApproval: true,
  },
  handler: applyPatch,
  resolveOutputError: (output) => {
    const result = output as ApplyPatchOutput;
    return result.status === "completed"
      ? undefined
      : {
          type: CoreErrorType.ToolExecutionFailed,
          code: `apply_patch_${result.status}`,
          message: result.summary,
        };
  },
  formatModelContent: (output) => {
    const result = output as ApplyPatchOutput;
    return `${result.summary}\n${result.operations.map((operation) => `${operation.status} ${operation.type} ${operation.filePath}${operation.movePath ? ` -> ${operation.movePath}` : ""}${operation.reason ? `: ${operation.reason}` : ""}`).join("\n")}\nCommitted paths: ${result.committedChanges.map((change) => change.filePath).join(", ")}`;
  },
  resolvePermissionRulePolicy: resolveApplyPatchPermissionRulePolicy,
  inputSchema: ApplyPatchInputJsonSchema,
  outputSchema: ApplyPatchOutputJsonSchema,
  runtimeInputSchema: ApplyPatchInputSchema,
  runtimeOutputSchema: ApplyPatchOutputSchema,
  permission: {
    permission: "edit",
    reason: "ApplyPatch changes all listed source and destination paths",
    riskLevel: "medium",
    sideEffectScope: "workspace",
    needsApproval: true,
    patternSources: ["path"],
    alwaysAllowPatternSources: ["path"],
    denyPriority: "beforeAsk",
  },
  resultBudget: {
    maxInlineBytes: 1_000_000,
    maxModelBytes: 100_000,
    strategy: "truncate",
    preview: { maxBytes: 100_000, direction: "head" },
  },
  timeout: { defaultMs: 30000, maxMs: 30000, allowCallOverride: false },
  cancellation: {
    supported: true,
    cleanup: "bestEffort",
    settlement: "afterHandler",
    userVisibleMessage: "ApplyPatch stopped; inspect committed changes before retrying",
  },
  trace: {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
