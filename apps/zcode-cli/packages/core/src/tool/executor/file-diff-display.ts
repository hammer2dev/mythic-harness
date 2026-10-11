import {
  ApplyPatchOutputSchema,
  type DiffHunk,
  type FileDiffToolResultDisplayPayload,
  type ToolResultDisplayPayload,
} from "@zcode/contracts";
import { countPatchLines } from "../diff.js";
import { isRecord } from "./utils.js";

const MAX_DISPLAY_DIFF_FILES = 32;
const MAX_DISPLAY_DIFF_HUNKS = 8;
const MAX_DISPLAY_DIFF_LINES = 160;

export function createFileDiffResultDisplay(
  toolName: string,
  output: unknown,
): ToolResultDisplayPayload | undefined {
  if (toolName === "ApplyPatch") {
    const parsed = ApplyPatchOutputSchema.safeParse(output);
    if (!parsed.success || parsed.data.committedChanges.length === 0) return undefined;
    let remainingLines = MAX_DISPLAY_DIFF_LINES;
    let truncated = parsed.data.committedChanges.length > MAX_DISPLAY_DIFF_FILES;
    const files = parsed.data.committedChanges.slice(0, MAX_DISPLAY_DIFF_FILES).map((change) => {
      const display = fileDisplay(change.filePath, change.structuredPatch, remainingLines);
      remainingLines -= display.structuredPatch.reduce(
        (total, hunk) => total + hunk.lines.length,
        0,
      );
      truncated ||= display.truncated === true;
      return display;
    });
    return {
      kind: "file_diffs",
      files,
      // 路径列表有展示上限；单独保留真实数量，避免客户端把截断后的长度当作全部变更。
      totalFiles: parsed.data.committedChanges.length,
      truncated,
    };
  }

  if (
    !isRecord(output) ||
    typeof output.filePath !== "string" ||
    !Array.isArray(output.structuredPatch)
  )
    return undefined;
  const hunks = output.structuredPatch.filter(isDiffHunk);
  return hunks.length ? fileDisplay(output.filePath, hunks, MAX_DISPLAY_DIFF_LINES) : undefined;
}

function fileDisplay(
  filePath: string,
  hunks: DiffHunk[],
  maxLines: number,
): FileDiffToolResultDisplayPayload {
  const { additions, deletions } = countPatchLines(hunks);
  const { patch, truncated } = boundDiffHunks(hunks, maxLines);
  return { kind: "file_diff", filePath, additions, deletions, structuredPatch: patch, truncated };
}

function isDiffHunk(value: unknown): value is DiffHunk {
  if (!isRecord(value)) return false;
  return (
    typeof value.oldStart === "number" &&
    typeof value.oldLines === "number" &&
    typeof value.newStart === "number" &&
    typeof value.newLines === "number" &&
    Array.isArray(value.lines) &&
    value.lines.every((line) => typeof line === "string")
  );
}

function boundDiffHunks(
  hunks: DiffHunk[],
  maxLines: number,
): { patch: DiffHunk[]; truncated: boolean } {
  const bounded: DiffHunk[] = [];
  let remainingLines = maxLines;
  let truncated = hunks.length > MAX_DISPLAY_DIFF_HUNKS;
  for (const hunk of hunks.slice(0, MAX_DISPLAY_DIFF_HUNKS)) {
    if (remainingLines <= 0) {
      truncated = true;
      break;
    }
    const lines = hunk.lines.slice(0, remainingLines);
    bounded.push({ ...hunk, lines });
    remainingLines -= lines.length;
    if (lines.length < hunk.lines.length) {
      truncated = true;
      break;
    }
  }
  return { patch: bounded, truncated };
}
