import {
  JavaRuntimeInputSchema,
  JavaRuntimeInputJsonSchema,
  JavaRuntimeOutputSchema,
  JavaRuntimeOutputJsonSchema,
  type JavaRuntimeOutput,
} from "@zcode/contracts";
import type { ToolEntry } from "../types.js";

export const javaRuntimeToolEntry: ToolEntry = {
  capability:
    "Discover project JDK candidates and remember explicit user JDK configuration in the execution environment",
  metadata: {
    name: "JavaRuntime",
    description:
      "Code Development plugin JDK configuration. list discovers installed JDKs. register remembers a user-provided installation as an environment-wide candidate; select explicitly pins the current project or its build JVM; clearSelection removes the current project/build pin without requiring a path and resumes automatic matching; forget removes a registration (never deletes the JDK). Writes require a matching current user message or real AskUserQuestion answer. When evidence is missing, ask the user; do not invent an answer. Do not use source/target/release as an exact JDK requirement. Tooling Java is separate and is never installed by this tool.",
    readOnly: false,
    destructive: false,
    concurrentSafe: false,
    sideEffectScope: "system",
    riskLevel: "low",
    needsApproval: false,
  },
  inputSchema: JavaRuntimeInputJsonSchema,
  outputSchema: JavaRuntimeOutputJsonSchema,
  runtimeInputSchema: JavaRuntimeInputSchema,
  runtimeOutputSchema: JavaRuntimeOutputSchema,
  // 系统配置副作用的通用 ask 会重复确认已提供的用户意图；写入仍须经过 handler 的可信来源校验。
  // 显式 deny 仍由 executor 拦截；无真实证据只返回 needs_user_input，绝不保存配置。
  prepareApproval: () => ({ gate: "proceed" }),
  handler: async (raw, context): Promise<JavaRuntimeOutput> => {
    const input = JavaRuntimeInputSchema.parse(raw);
    await context.languageServicePort?.refresh();
    if (!context.languageServicePort?.enabled || !context.javaRuntimePort) {
      return { status: "disabled", message: "Code Development plugin is disabled or unavailable." };
    }
    if (input.operation !== "list") {
      if (
        (input.operation !== "clearSelection" && !input.path) ||
        !context.turnId ||
        !context.userIntentEvidence?.allowsJdkChange({
          turnId: context.turnId,
          path: input.path,
          operation: input.operation,
          scope:
            input.operation === "select" || input.operation === "clearSelection"
              ? "project"
              : "environment",
          purpose: input.purpose,
        })
      )
        return {
          status: "needs_user_input",
          message:
            input.operation === "clearSelection"
              ? "Explicitly ask to clear the current project JDK selection (or build JVM selection) in this conversation. No path needs to be repeated; no configuration was saved."
              : "Provide the JDK path and intended change in the current conversation or a real AskUserQuestion answer. No configuration was saved.",
        };
    }
    return context.javaRuntimePort.execute(input);
  },
  formatModelContent: (output) => JSON.stringify(output),
  permission: {
    permission: "JavaRuntime",
    reason: "Manage JDK registration only for an explicit user intent",
    riskLevel: "low",
    sideEffectScope: "system",
    needsApproval: false,
    patternSources: ["toolName"],
    denyPriority: "beforeAsk",
  },
  resultBudget: { maxInlineBytes: 16_000, maxModelBytes: 16_000, strategy: "truncate" },
  timeout: { defaultMs: 30_000, maxMs: 30_000, allowCallOverride: false },
  cancellation: {
    supported: true,
    cleanup: "bestEffort",
    settlement: "afterHandler",
    userVisibleMessage: "JDK configuration request cancelled",
  },
  trace: {
    required: true,
    propagateToAdapters: true,
    recordInput: "summary",
    recordOutput: "summary",
  },
};
