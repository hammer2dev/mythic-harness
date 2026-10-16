import {
  LspInputJsonSchema,
  LspInputSchema,
  LspOutputJsonSchema,
  LspOutputSchema,
  type LspOutput,
} from "@zcode/contracts";
import { resolveWorkspacePath } from "../path-policy.js";
import type { ToolEntry } from "../types.js";

export const lspToolEntry: ToolEntry = {
  capability:
    "Query language-aware definitions, references, symbols, types and version-checked diagnostics",
  metadata: {
    name: "LSP",
    description:
      "Code Development plugin language intelligence (Java first). Use for symbol definitions, references, implementations, hover, file/workspace symbols and diagnostics. Search with ToolSearch to load. File positions are one-based UTF-16. Results state freshness and readiness; pending or unknown is not a clean check. Project import may resolve build dependencies. Does not rename, format or apply server edits.",
    readOnly: true,
    destructive: false,
    concurrentSafe: true,
    sideEffectScope: "none",
    riskLevel: "low",
    needsApproval: false,
  },
  inputSchema: LspInputJsonSchema,
  outputSchema: LspOutputJsonSchema,
  runtimeInputSchema: LspInputSchema,
  runtimeOutputSchema: LspOutputSchema,
  handler: async (raw, context) => {
    const input = LspInputSchema.parse(raw);
    const positioned = ["definition", "references", "implementation", "hover"].includes(
      input.operation,
    );
    if ((positioned || input.operation === "documentSymbols") && !input.file_path) {
      throw new Error(`${input.operation} requires file_path`);
    }
    if (positioned && (input.line === undefined || input.column === undefined)) {
      throw new Error(`${input.operation} requires one-based line and column`);
    }
    const service = context.languageServicePort;
    if (!service) throw new Error("Code Development language service is not configured");
    await service.refresh();
    const file_path = input.file_path
      ? resolveWorkspacePath({
          inputPath: input.file_path,
          operation: "read",
          workingDirectory: context.workingDirectory,
          workspaceRoot: context.workspaceRoot,
        })
      : undefined;
    return service.query(
      { ...input, file_path },
      {
        signal: context.abortSignal,
        trace: context.traceContext ?? {
          traceId: context.traceId,
          sessionId: context.sessionId,
          turnId: context.turnId,
        },
      },
    );
  },
  formatModelContent: (output) => JSON.stringify(output as LspOutput),
  permission: {
    permission: "read",
    reason: "Read language analysis within the permitted workspace",
    riskLevel: "low",
    sideEffectScope: "none",
    needsApproval: false,
    patternSources: ["path", "input"],
    alwaysAllowPatternSources: ["path"],
    denyPriority: "beforeAsk",
  },
  resultBudget: { maxInlineBytes: 32_000, maxModelBytes: 32_000, strategy: "truncate" },
  timeout: { defaultMs: 120_000, maxMs: 120_000, allowCallOverride: false },
  cancellation: {
    supported: true,
    cleanup: "required",
    userVisibleMessage: "Language query cancelled",
  },
  trace: {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
