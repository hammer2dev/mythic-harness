import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

export const LspInputSchema = z
  .object({
    operation: z.enum([
      "definition",
      "references",
      "implementation",
      "hover",
      "documentSymbols",
      "workspaceSymbols",
      "diagnostics",
    ]),
    file_path: z.string().min(1).optional().describe("File path; required for file operations"),
    line: z.number().int().positive().optional().describe("One-based line"),
    column: z.number().int().positive().optional().describe("One-based UTF-16 column"),
    query: z.string().optional().describe("Workspace symbol search text"),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Maximum returned items; default 50"),
  })
  .strict();

export type LspInput = z.infer<typeof LspInputSchema>;
export const LspInputJsonSchema = toToolJsonSchema(LspInputSchema);

export const LanguagePositionSchema = z
  .object({
    line: z.number().int().positive(),
    column: z.number().int().positive(),
  })
  .strict();

export const LanguageLocationSchema = z
  .object({
    path: z.string(),
    start: LanguagePositionSchema,
    end: LanguagePositionSchema,
  })
  .strict();

export const LanguageDiagnosticSchema = LanguageLocationSchema.extend({
  severity: z.enum(["error", "warning", "information", "hint"]),
  message: z.string(),
  code: z.string().optional(),
  source: z.string().optional(),
}).strict();

export const LanguageSymbolSchema = z
  .object({
    name: z.string(),
    kind: z.number().int(),
    location: LanguageLocationSchema,
    containerName: z.string().optional(),
  })
  .strict();

export const LspOutputSchema = z
  .object({
    status: z.enum([
      "ready",
      "pending",
      "needs_configuration",
      "unsupported",
      "failed",
      "disabled",
    ]),
    freshness: z.enum(["current", "stale", "unknown"]),
    scope: z.enum(["file", "workspace"]),
    languageId: z.string(),
    message: z.string().optional(),
    filePath: z.string().optional(),
    fileRevision: z.string().optional(),
    documentVersion: z.number().int().nonnegative().optional(),
    contentHash: z.string().optional(),
    locations: z.array(LanguageLocationSchema).optional(),
    symbols: z.array(LanguageSymbolSchema).optional(),
    hover: z.string().optional(),
    diagnostics: z.array(LanguageDiagnosticSchema).optional(),
    truncated: z.boolean(),
  })
  .strict();

export type LanguageLocation = z.infer<typeof LanguageLocationSchema>;
export type LanguageDiagnostic = z.infer<typeof LanguageDiagnosticSchema>;
export type LanguageSymbol = z.infer<typeof LanguageSymbolSchema>;
export type LspOutput = z.infer<typeof LspOutputSchema>;
export const LspOutputJsonSchema = toToolJsonSchema(LspOutputSchema);
