// ============================================================
// ApplyPatch Tool - Structured patch editing tool
// ============================================================

import { z } from "zod";
import type { ToolCallId, TraceId } from "../interfaces/shared.js";
import { EditDiffHunkSchema, type DiffHunk } from "./edit.js";
import { toToolJsonSchema } from "./json-schema.js";
import type {
  FileSystemRevision,
  FileSystemTextEncoding,
  FileSystemLineEndings,
} from "../interfaces/file-system.port.js";

export const ApplyPatchInputSchema = z
  .object({
    patch_text: z.string().describe("The full structured patch text to apply"),
  })
  .strict();

export type ApplyPatchInput = z.infer<typeof ApplyPatchInputSchema>;

export const ApplyPatchInputJsonSchema = toToolJsonSchema(ApplyPatchInputSchema);

export const ApplyPatchFileChangeSchema = z
  .object({
    filePath: z.string(),
    type: z.enum(["add", "update", "delete", "move"]),
    movePath: z.string().optional(),
    structuredPatch: z.array(EditDiffHunkSchema),
    additions: z.number().int().nonnegative(),
    deletions: z.number().int().nonnegative(),
  })
  .strict();

export interface ApplyPatchFileChange {
  filePath: string;
  type: "add" | "update" | "delete" | "move";
  movePath?: string;
  structuredPatch: DiffHunk[];
  additions: number;
  deletions: number;
}

export interface ApplyPatchOutput {
  status: "completed" | "partial" | "failed";
  operations: ApplyPatchOperationResult[];
  committedChanges: ApplyPatchCommittedChange[];
  files: ApplyPatchFileChange[];
  structuredPatch: DiffHunk[];
  summary: string;
}

const PatchRevisionSchema = z
  .object({
    id: z.string(),
    mtimeMs: z.number().optional(),
    sizeBytes: z.number().optional(),
    hash: z.string().optional(),
  })
  .strict();

export const ApplyPatchOperationResultSchema = z
  .object({
    filePath: z.string(),
    type: z.enum(["add", "update", "delete", "move"]),
    movePath: z.string().optional(),
    status: z.enum(["applied", "failed", "not_attempted", "unconfirmed"]),
    reason: z.string().optional(),
  })
  .strict();

export type ApplyPatchOperationResult = z.infer<typeof ApplyPatchOperationResultSchema>;

export interface ApplyPatchCommittedChange {
  filePath: string;
  originalFile: string | null;
  content: string | null;
  structuredPatch: DiffHunk[];
  beforeRevision?: FileSystemRevision;
  afterRevision?: FileSystemRevision;
  beforeEncoding?: FileSystemTextEncoding;
  beforeLineEndings?: FileSystemLineEndings;
}

export const ApplyPatchCommittedChangeSchema = z
  .object({
    filePath: z.string(),
    originalFile: z.string().nullable(),
    content: z.string().nullable(),
    structuredPatch: z.array(EditDiffHunkSchema),
    beforeRevision: PatchRevisionSchema.optional(),
    afterRevision: PatchRevisionSchema.optional(),
    beforeEncoding: z
      .enum([
        "ascii",
        "utf8",
        "utf-8",
        "utf16le",
        "utf-16le",
        "ucs2",
        "ucs-2",
        "base64",
        "base64url",
        "latin1",
        "binary",
        "hex",
        "gb2312",
        "gbk",
        "gb18030",
      ])
      .optional(),
    beforeLineEndings: z.enum(["LF", "CRLF"]).optional(),
  })
  .strict();

export const ApplyPatchOutputSchema = z
  .object({
    status: z.enum(["completed", "partial", "failed"]),
    operations: z.array(ApplyPatchOperationResultSchema),
    committedChanges: z.array(ApplyPatchCommittedChangeSchema),
    files: z.array(ApplyPatchFileChangeSchema),
    structuredPatch: z.array(EditDiffHunkSchema),
    summary: z.string(),
  })
  .strict();

export const ApplyPatchOutputJsonSchema = toToolJsonSchema(ApplyPatchOutputSchema);

export interface ApplyPatchToolCall {
  id: ToolCallId;
  name: "ApplyPatch";
  input: ApplyPatchInput;
  traceId: TraceId;
  startedAt: Date;
}

export interface ApplyPatchToolResult {
  toolCallId: ToolCallId;
  output: ApplyPatchOutput;
  traceId: TraceId;
  durationMs: number;
}

export const ApplyPatchErrorCode = {
  INVALID_PATCH: "apply_patch_invalid_patch",
  EMPTY_PATCH: "apply_patch_empty_patch",
  FILE_NOT_EXIST: "apply_patch_file_not_exist",
  FILE_EXISTS: "apply_patch_file_exists",
  HUNK_NOT_FOUND: "apply_patch_hunk_not_found",
  IO_ERROR: "apply_patch_io_error",
} as const;

export type ApplyPatchErrorCode = (typeof ApplyPatchErrorCode)[keyof typeof ApplyPatchErrorCode];
