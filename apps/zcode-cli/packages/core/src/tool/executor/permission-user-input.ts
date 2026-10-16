import type { PermissionBrokerResult, TraceContext } from "@zcode/contracts";
import type { ToolExecutorDeps } from "./types.js";

/** 仅录入真实 broker 胜者的回答；hook 输入和超时空答案不成为配置授权证据。 */
export function recordTrustedPermissionAnswers(
  deps: ToolExecutorDeps,
  outcome: { source: "broker" | "hook"; result: PermissionBrokerResult },
  trace: TraceContext,
  signal?: AbortSignal,
): PermissionBrokerResult {
  const turnId = trace.turnId ?? deps.turnId;
  if (
    outcome.source !== "broker" ||
    !outcome.result.trustedUserAnswers?.length ||
    turnId === undefined ||
    signal?.aborted
  )
    return outcome.result;
  deps.recordTrustedUserAnswers?.(turnId, outcome.result.trustedUserAnswers);
  return outcome.result;
}
