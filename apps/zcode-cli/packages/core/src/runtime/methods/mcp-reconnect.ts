import {
  McpReconnectRejectedError,
  type McpReconnectRequest,
  type McpServerConfig,
  type McpServerStatus,
  type TraceContext,
  type TurnId,
} from "@zcode/contracts";
import { createRuntimeCommandId, type McpReconnectRuntimeCommand } from "../command-queue.js";
import type { AgentRuntimeInternal } from "../internal.js";
import { publishMcpReconnectState } from "./mcp-reconnect-persistence.js";
import { synchronizeRuntimeMcpCatalog } from "./mcp.js";
import { registerMcpTools } from "../deps.js";

const MCP_RECONNECT_OAUTH_WAIT_MS = 15_000;

export function requestMcpReconnect(
  this: AgentRuntimeInternal,
  input: McpReconnectRequest & { config: McpServerConfig },
): Promise<void> {
  return this.trackResidencyBlockingWork(admitMcpReconnect.call(this, input));
}

async function admitMcpReconnect(
  this: AgentRuntimeInternal,
  input: McpReconnectRequest & { config: McpServerConfig },
): Promise<void> {
  requireMcpLifecycle(this, input.config);
  const foregroundId = this.activeForegroundExecution?.foregroundExecutionId ?? null;
  if (foregroundId !== input.expectedForegroundExecutionId) {
    throw new McpReconnectRejectedError(
      "fault.mcp.foregroundMismatch",
      "The foreground execution has changed",
    );
  }
  const target = this.activeTurn ?? this.activeTurnStartReservation;
  if (
    (target && (target.kind !== "regular" || ("steerable" in target && !target.steerable))) ||
    (!target && this.hasActiveOrQueuedTurnWork())
  ) {
    throw new McpReconnectRejectedError(
      "fault.mcp.turnNotSteerable",
      "The session has no regular model request boundary",
    );
  }
  const command: McpReconnectRuntimeCommand = {
    id: createRuntimeCommandId(),
    mode: "mcp-reconnect",
    priority: "next",
    createdAt: new Date(),
    branchGeneration: this.branchGeneration,
    serverName: input.serverName,
    config: input.config,
    sourceCommandId: input.sourceCommandId,
    expectedForegroundExecutionId: foregroundId,
    targetTurnId: target?.turnId,
    anchorMessageId: this.latestConversationMessageId,
    traceContext: input.traceContext ?? target?.traceContext ?? this.rootTraceContext,
  };
  await this.ensureSessionPersisted(`/mcp connect ${input.serverName}`, command.traceContext);
  await publishMcpReconnectState(this, command, { phase: "queued" });
  if (command.branchGeneration !== this.branchGeneration) {
    throw new McpReconnectRejectedError(
      "fault.mcp.foregroundMismatch",
      "The conversation branch changed before acceptance",
    );
  }
  try {
    await input.onAdmitted?.();
  } catch (error) {
    await publishMcpReconnectState(this, command, {
      phase: "failed",
      reason: "MCP request acceptance could not be persisted",
    });
    throw error;
  }
  // admission 只等待持久回执。网络与下一请求边界由同一 Runtime 队列拥有，不能堵住 Stop。
  this.enqueueRuntimeCommand(command);
}

export async function connectMcpServer(
  this: AgentRuntimeInternal,
  serverName: string,
  config: McpServerConfig,
  options: { signal?: AbortSignal; traceContext?: TraceContext } = {},
): Promise<McpServerStatus> {
  requireMcpLifecycle(this, config);
  const port = this.mcpPort!;
  const existing = (await port.status())[serverName];
  options.signal?.throwIfAborted();
  // 原生 adapter 不经过 pool 的 revalidate；已活连接和 OAuth owner 也不能被主动重建。
  if (existing?.status === "connecting") return existing;
  if (existing?.status === "connected") {
    const alive = (await port.pingServer?.(serverName)) ?? true;
    options.signal?.throwIfAborted();
    if (alive) return existing;
  }
  return await port.connectServer(serverName, config, {
    revalidate: true,
    signal: options.signal,
    oauthAuthorizationTimeoutMs: MCP_RECONNECT_OAUTH_WAIT_MS,
    trace: options.traceContext ?? this.rootTraceContext,
    workingDirectory: this.workingDirectory,
    workspaceIdentity: this.config.workspaceIdentity?.toString(),
  });
}

export async function drainPendingMcpReconnects(
  runtime: AgentRuntimeInternal,
  turnId: TurnId,
  signal: AbortSignal,
): Promise<void> {
  for (const command of runtime.runtimeCommandQueue.snapshot()) {
    if (command.mode !== "mcp-reconnect") continue;
    runtime.runtimeCommandQueue.removeById(command.id);
    if (command.targetTurnId !== turnId) {
      await publishMcpReconnectState(runtime, command, {
        phase: "cancelled",
        reason: "The target turn has ended",
      });
      continue;
    }
    await runMcpReconnectCommand(runtime, command, signal);
  }
}

export async function runMcpReconnectCommand(
  runtime: AgentRuntimeInternal,
  command: McpReconnectRuntimeCommand,
  signal: AbortSignal,
): Promise<void> {
  const work = executeMcpReconnect(runtime, command, signal);
  runtime.mcpReconnectInFlight = work;
  try {
    await work;
  } finally {
    if (runtime.mcpReconnectInFlight === work) runtime.mcpReconnectInFlight = undefined;
  }
}

export async function cancelQueuedMcpReconnects(
  runtime: AgentRuntimeInternal,
  turnId?: TurnId,
): Promise<void> {
  const commands = runtime.runtimeCommandQueue
    .snapshot()
    .filter(
      (command): command is McpReconnectRuntimeCommand =>
        command.mode === "mcp-reconnect" &&
        (turnId === undefined || command.targetTurnId === turnId),
    );
  // 先同步摘除全部目标，持久化 await 期间不得被下一 turn 消费。
  for (const command of commands) runtime.runtimeCommandQueue.removeById(command.id);
  for (const command of commands) {
    await publishMcpReconnectState(runtime, command, {
      phase: "cancelled",
      reason: "The target execution has ended",
    });
  }
}

async function executeMcpReconnect(
  runtime: AgentRuntimeInternal,
  command: McpReconnectRuntimeCommand,
  signal: AbortSignal,
): Promise<void> {
  const cancellation = (): string | undefined => {
    if (runtime.shuttingDown) return "The session is closing";
    if (signal.aborted) return "MCP recovery was cancelled";
    if (command.targetTurnId) {
      if (runtime.activeTurn?.turnId !== command.targetTurnId) return "The target turn has ended";
      if (
        (runtime.activeForegroundExecution?.foregroundExecutionId ?? null) !==
        command.expectedForegroundExecutionId
      ) {
        return "The foreground execution has changed";
      }
    }
    return undefined;
  };
  const isCancelled = (): boolean =>
    command.branchGeneration !== runtime.branchGeneration || cancellation() !== undefined;
  const publishCancellation = (): Promise<void> =>
    publishMcpReconnectState(runtime, command, {
      phase: "cancelled",
      reason: cancellation() ?? "The conversation branch has changed",
    });
  if (isCancelled()) return await publishCancellation();
  try {
    requireMcpLifecycle(runtime, command.config);
    await waitForMcpWork(runtime.initializeMcp(command.traceContext), signal);
    if (isCancelled()) return await publishCancellation();
    await publishMcpReconnectState(runtime, command, { phase: "connecting" });
    if (isCancelled()) return await publishCancellation();
    const status = await waitForMcpWork(
      connectMcpServer.call(runtime, command.serverName, command.config, {
        signal,
        traceContext: command.traceContext,
      }),
      signal,
    );
    if (isCancelled()) return await publishCancellation();
    if (!synchronizeRuntimeMcpCatalog(runtime)) {
      registerMcpTools(runtime.registry, runtime.mcpPort!, await runtime.mcpPort!.listTools(), {
        allowedTools: runtime.config.toolAllowlist,
        disallowedTools: runtime.config.toolDisallowlist,
      });
      runtime.invalidateToolCache();
    }
    if (isCancelled()) return await publishCancellation();
    const catalogRevision = runtime.mcpPort?.getToolCatalog?.()?.revision;
    const toolCount = runtime
      .getTools()
      .filter(
        (tool) =>
          runtime.registry.getMetadata(tool.name)?.mcpPresentation?.serverName ===
          command.serverName,
      ).length;
    const awaitingAuthorization =
      status.status === "connecting" && status.authorization !== undefined;
    await publishMcpReconnectState(runtime, command, {
      phase:
        status.status === "connected"
          ? "connected"
          : awaitingAuthorization
            ? "awaiting_authorization"
            : status.status === "connecting"
              ? "connecting"
              : "failed",
      toolCount,
      ...(catalogRevision === undefined ? {} : { catalogRevision }),
      ...(status.failureKind ? { failureKind: status.failureKind } : {}),
      ...(status.status === "connected" || awaitingAuthorization
        ? {}
        : {
            reason:
              status.status === "connecting"
                ? "MCP connection is still in progress; retry after the current connection attempt finishes"
                : "MCP connection failed; inspect the server connection status for details",
          }),
    });
  } catch (error) {
    if (isCancelled()) return await publishCancellation();
    await publishMcpReconnectState(runtime, command, {
      phase: "failed",
      // 网络异常可能携带凭据或服务地址；持久回执只保留受控摘要。
      reason: error instanceof McpReconnectRejectedError ? error.message : "MCP connection failed",
    });
  }
}

function requireMcpLifecycle(runtime: AgentRuntimeInternal, config: McpServerConfig): void {
  if (runtime.shuttingDown)
    throw new McpReconnectRejectedError("fault.mcp.runtimeClosing", "The session is closing");
  if (!runtime.mcpPort || runtime.config.mcp?.enabled === false || config.enabled === false) {
    throw new McpReconnectRejectedError(
      "fault.mcp.disabled",
      "MCP or the requested server is disabled",
    );
  }
  if (runtime.mcpPort.supportsConnectionLifecycle === false) {
    throw new McpReconnectRejectedError(
      "fault.mcp.borrowedLifecycle",
      "A borrowed MCP connection cannot be managed by this session",
    );
  }
}

function waitForMcpWork<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason ?? new Error("MCP recovery cancelled"));
    if (signal.aborted) abort();
    else signal.addEventListener("abort", abort, { once: true });
    // 只取消当前 waiter；共享 OAuth owner 继续由 adapter 管理，晚到结果不能回写请求状态。
    work.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}
