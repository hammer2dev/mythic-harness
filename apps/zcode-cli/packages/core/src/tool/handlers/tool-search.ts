import {
  CoreErrorType,
  createCoreError,
  ToolSearchInputSchema,
  ToolSearchInputJsonSchema,
  ToolSearchOutputSchema,
  ToolSearchOutputJsonSchema,
} from "@zcode/contracts";
import type { ToolEntry } from "../types.js";

export const toolSearchToolEntry: ToolEntry = {
  capability: "Discover and load eligible built-in and MCP tools for subsequent model requests",
  metadata: {
    name: "ToolSearch",
    description:
      "Search available built-in and MCP tools by name or capability and load matching tool definitions. Use this when the needed tool is absent from the current tools list, including Agent, Skill, ApplyPatch, workflow, and MCP tools. Only loaded matches become callable with their full schemas on the next model step. Search does not execute tools or grant permission. Narrow the query when a match exceeds the schema budget.",
    readOnly: true,
    destructive: false,
    concurrentSafe: false,
    allowedInPlanMode: true,
    sideEffectScope: "session",
    riskLevel: "low",
    needsApproval: false,
  },
  handler: async (input, context) => {
    const parsed = ToolSearchInputSchema.parse(input);
    context.abortSignal.throwIfAborted();
    if (!context.searchTools) {
      throw createCoreError(
        CoreErrorType.ConfigurationError,
        "ToolSearch runtime is not configured",
        { recoverable: false },
      );
    }
    return context.searchTools(parsed, {
      model: context.model,
      turnId: context.turnId,
      abortSignal: context.abortSignal,
    });
  },
  inputSchema: ToolSearchInputJsonSchema,
  outputSchema: ToolSearchOutputJsonSchema,
  runtimeInputSchema: ToolSearchInputSchema,
  runtimeOutputSchema: ToolSearchOutputSchema,
  permission: {
    permission: "tool.search",
    reason: "ToolSearch only changes session-local tool exposure, not execution permission",
    riskLevel: "low",
    sideEffectScope: "session",
    needsApproval: false,
    patternSources: ["toolName"],
    alwaysAllowPatternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: { maxInlineBytes: 12000, maxModelBytes: 12000, strategy: "truncate" },
  timeout: { defaultMs: 30000, maxMs: 30000, allowCallOverride: false },
  cancellation: {
    supported: true,
    cleanup: "none",
    userVisibleMessage: "Tool search was cancelled before activation",
  },
  trace: {
    required: true,
    propagateToAdapters: false,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
