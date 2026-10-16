import {
  createMessageId,
  createPartId,
  SessionEventType,
  type McpReconnectUpdatedPayload,
} from "@zcode/contracts";
import type { ZCodeMcpReconnectState } from "@zcode/shared";
import type { McpReconnectRuntimeCommand } from "../command-queue.js";
import type { AgentRuntimeInternal } from "../internal.js";

export async function publishMcpReconnectState(
  runtime: AgentRuntimeInternal,
  command: McpReconnectRuntimeCommand,
  update: Omit<ZCodeMcpReconnectState, "sourceCommandId" | "serverName">,
): Promise<void> {
  // rewind 后旧请求只能留在旧分支，晚到结果不能重新写进当前会话投影。
  if (command.branchGeneration !== runtime.branchGeneration) return;
  const state: ZCodeMcpReconnectState = {
    sourceCommandId: command.sourceCommandId,
    serverName: command.serverName,
    ...update,
  };
  const pending = state.phase === "queued" || state.phase === "connecting";
  const started = command.createdAt.getTime();
  const completed = pending ? undefined : Date.now();
  const key = `mcp_reconnect_${runtime.sessionId}_${command.sourceCommandId}`;
  await runtime.persistAssistantTimelinePartForSession({
    sessionId: runtime.sessionId,
    expectedBranchGeneration: command.branchGeneration,
    messageID: createMessageId(key),
    partID: createPartId(`${key}_timeline`),
    parentID: command.anchorMessageId,
    created: started,
    completed,
    finish: state.phase,
    traceContext: command.traceContext,
    timeline: {
      timelineType: "mcp_reconnect",
      display: "worklog",
      status: state.phase,
      anchorMessageId: command.anchorMessageId,
      anchorTurnId: command.targetTurnId,
      time: { start: started, ...(completed === undefined ? {} : { end: completed }) },
      ...state,
    },
  });
  if (command.branchGeneration !== runtime.branchGeneration) return;
  const payload: McpReconnectUpdatedPayload = {
    state,
    ...(command.targetTurnId ? { anchorTurnId: command.targetTurnId } : {}),
  };
  await runtime.appendEvent(
    runtime.createEvent(SessionEventType.McpReconnectUpdated, payload, command.traceContext),
    command.traceContext,
  );
}
