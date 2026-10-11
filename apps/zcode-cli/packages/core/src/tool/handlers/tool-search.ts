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
      "Discover and load eligible built-in and MCP tools whose definitions are not in the current tool list. When a task needs a missing specialized capability, call ToolSearch before substituting general-purpose tools or reporting that capability unavailable. Query an exact tool name or concise capability keywords, such as Agent, Skill, workflow, or an MCP service/action. After loading, call the tool on the next model step using its full schema. Reuse suitable tools already available; do not search before every call. If no match is found or the budget is exceeded, refine the query or use an available alternative instead of repeating the same search. ToolSearch discovers tools, not project files; it does not execute matches or grant permission.",
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
