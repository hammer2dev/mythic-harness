import {
  type CollaborationMode,
  type PermissionBrokerRequest,
  type PermissionBrokerResult,
  type PermissionRuleset,
  type TraceContext,
} from "@zcode/contracts";

import type { PermissionDecisionResult, PermissionContext } from "../../permission/service.js";
import type { ExecutableToolCall, ToolEntry, ToolExecutionResult } from "../types.js";
import { normalizeToolExecutionInput } from "../input-normalization.js";
import { createErrorResult, createPermissionErrorResult } from "./errors.js";
import { validateInput } from "./validation.js";
import { applyMemoryFilePermission, targetsMemoryFile } from "./memory-file-permission.js";
import {
  resolveRuntimePermissionCapability,
  resolveRuntimePermissionContext,
} from "./permission-capability.js";
import { buildDefaultPermissionUpdates } from "./permission-suggestions.js";
import type { ToolExecutorDeps } from "./types.js";

interface PermissionHookInputRecheckResult {
  brokerResult?: PermissionBrokerResult;
  permissionDecision?: PermissionDecisionResult;
}

export type ToolPermissionFlowResult =
  | { allowed: true; executionInput: unknown; permissionWaitMs?: number }
  | { allowed: false; result: ToolExecutionResult };

export async function resolvePermissionModifiedInput(
  input: Omit<Parameters<typeof recheckPermissionHookModifiedInput>[0], "modifiedInput"> & {
    modifiedInput: unknown;
    alreadyCheckedByHook: boolean;
    permissionWaitMs: number;
  },
): Promise<ToolPermissionFlowResult> {
  const modifiedInput = input.alreadyCheckedByHook
    ? input.modifiedInput
    : normalizeToolExecutionInput({
        entry: input.entry,
        input: input.modifiedInput,
        logger: input.deps.logger,
        source: "permission",
      });
  const validation = validateInput(modifiedInput, input.entry);
  if (validation) return { allowed: false, result: createErrorResult(input.toolCall, validation) };
  if (input.toolCall.name === "ApplyPatch" && !input.alreadyCheckedByHook) {
    // broker 可改写多个路径；原输入获批不代表新目标能绕过项目 deny/ask。
    const recheck = await recheckPermissionHookModifiedInput({ ...input, modifiedInput });
    if (recheck.brokerResult && recheck.brokerResult.decision !== "allow") {
      return {
        allowed: false,
        result: createPermissionErrorResult(
          input.toolCall,
          recheck.brokerResult.reason ?? "Modified patch targets were not approved",
          { decision: recheck.brokerResult.decision, requestId: input.requestId },
        ),
      };
    }
  }
  return { allowed: true, executionInput: modifiedInput, permissionWaitMs: input.permissionWaitMs };
}

export async function recheckPermissionHookModifiedInput(input: {
  deps: ToolExecutorDeps;
  entry: ToolEntry;
  mode: CollaborationMode;
  modifiedInput: unknown;
  projectRules: PermissionRuleset | null;
  requestId: string;
  signal?: AbortSignal;
  toolCall: ExecutableToolCall;
  traceContext: TraceContext;
}): Promise<PermissionHookInputRecheckResult> {
  const runtimePermissionContext = resolveRuntimePermissionContext(input.deps);
  const permissionContext: PermissionContext = {
    input: input.modifiedInput,
    mode: input.mode,
    prePlanMode: input.deps.sessionModePort?.getPrePlanMode(),
    planEnabled: input.deps.sessionModePort?.isPlanEnabled?.(),
    riskLevel: input.entry.metadata.riskLevel,
    toolName: input.toolCall.name,
    // 与首次判定同源：hook 改过 input 之后，草稿免确认仍要按同一个工作目录复核。
    workingDirectory: input.deps.getWorkingDirectory(),
  };
  const rulePolicy = input.entry.resolvePermissionRulePolicy?.(
    input.modifiedInput,
    runtimePermissionContext,
  );
  let decision = input.deps.permissionService.checkPermission(
    permissionContext,
    resolveRuntimePermissionCapability(input.entry, input.modifiedInput, runtimePermissionContext),
    input.projectRules,
    rulePolicy,
  );
  decision = applyMemoryFilePermission({
    decision,
    executionInput: input.modifiedInput,
    memoryRoot: input.deps.getMemoryRoot?.(),
    toolName: input.toolCall.name,
    workingDirectory: input.deps.getWorkingDirectory(),
    workspaceRoot: input.deps.getWorkspaceRoot(),
  });

  if (decision.decision === "deny") {
    return {
      brokerResult: { decision: "deny", reason: decision.reason },
      permissionDecision: decision,
    };
  }
  if (
    decision.decision !== "ask" ||
    (decision.ruleId !== "rule.project.ask" &&
      !targetsMemoryFile({
        executionInput: input.modifiedInput,
        memoryRoot: input.deps.getMemoryRoot?.(),
        toolName: input.toolCall.name,
        workingDirectory: input.deps.getWorkingDirectory(),
        workspaceRoot: input.deps.getWorkspaceRoot(),
      }))
  ) {
    return {};
  }

  const suggestedPermissionUpdates =
    rulePolicy?.suggestedPermissionUpdates ??
    buildDefaultPermissionUpdates(input.toolCall.name, input.modifiedInput);
  const brokerResult = await input.deps.permissionBroker.requestPermission(
    {
      input: input.modifiedInput,
      mode: input.mode,
      reason: decision.reason ?? `Tool ${input.toolCall.name} requires approval`,
      requestId: input.requestId,
      requestedAt: new Date(),
      riskLevel: decision.riskLevel,
      ruleId: decision.ruleId,
      sessionId: input.deps.sessionId,
      sideEffectScope: decision.sideEffectScope,
      suggestedPermissionUpdates,
      toolCallId: input.toolCall.id as PermissionBrokerRequest["toolCallId"],
      toolName: input.toolCall.name,
      traceId: input.traceContext.traceId,
      turnId: input.traceContext.turnId ?? input.deps.turnId,
    },
    {
      signal: input.signal,
      timeoutMs: input.deps.permissionTimeoutMs,
    },
  );
  return { brokerResult, permissionDecision: decision };
}
