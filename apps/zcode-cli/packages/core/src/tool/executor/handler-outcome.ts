import type { ToolEntry, ToolExecutionResult } from "../types.js";
import { createToolResultDisplay } from "./result-display.js";
import { boundDisplayText } from "./display-text.js";

/** 后置处理失败不能擦除已经返回的提交事实；模型仅接收工具声明的有界摘要。 */
export function retainCompletedHandlerOutput(
  result: ToolExecutionResult,
  entry: ToolEntry,
  output: unknown,
  readFileStateMetadata: ToolExecutionResult["readFileStateMetadata"],
): ToolExecutionResult {
  if (!entry.resolveOutputError || output === undefined) return result;
  const summary = entry.formatModelContent?.(output);
  const content = [result.error?.message, typeof summary === "string" ? summary : undefined]
    .filter(Boolean)
    .join("\n\n");
  const bounded = boundDisplayText(content, entry.resultBudget.maxModelBytes);
  const bytes = Buffer.byteLength(bounded.value, "utf8");
  return {
    ...result,
    output,
    display: createToolResultDisplay(entry.metadata.name, output),
    modelContent: bounded.value,
    serialization: {
      content: bounded.value,
      modelContent: bounded.value,
      originalBytes: Buffer.byteLength(content, "utf8"),
      returnedBytes: bytes,
      truncated: bounded.truncated,
      budgetStrategy: "truncate",
    },
    ...(readFileStateMetadata ? { readFileStateMetadata } : {}),
  };
}
