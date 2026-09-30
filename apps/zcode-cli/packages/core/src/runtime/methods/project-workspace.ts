import { zcodeProjectWorkspaceSchema, type ZCodeProjectWorkspace } from "@zcode/shared";
import type { MessageWithParts, TraceContext } from "../deps.js";
import type { AgentRuntimeInternal } from "../internal.js";

export function latestProjectWorkspace(
  messages: readonly MessageWithParts[],
): ZCodeProjectWorkspace | undefined {
  for (let index = messages.length - 1; index >= 0; index--) {
    const metadata = messages[index]?.info.metadata;
    const intent = metadata?.conversationInputIntent ?? metadata?.inputIntent;
    if (!intent || typeof intent !== "object") continue;
    const parsed = zcodeProjectWorkspaceSchema.safeParse(
      (intent as Record<string, unknown>).projectWorkspace,
    );
    if (parsed.success) return parsed.data;
  }
  return undefined;
}

/** 项目归属只绑定一次；目录配置则随已接受的输入快照在下一轮生效。 */
export async function bindWorkspaceProject(
  runtime: AgentRuntimeInternal,
  workspace: ZCodeProjectWorkspace | undefined,
): Promise<void> {
  if (!workspace) return;
  const current = runtime.config.workspaceProjectId;
  if (current && current !== workspace.projectId) {
    throw new Error("Cannot move an existing session to another project");
  }
  if (current) return;
  if (runtime.sessionPersisted && runtime.sessionStore) {
    await runtime.sessionStore.updateSession({
      id: runtime.sessionId,
      workspaceProjectId: workspace.projectId,
    });
  }
  runtime.config.workspaceProjectId = workspace.projectId;
}

export function usesCurrentProjectWorkspace(
  runtime: AgentRuntimeInternal,
  workspace: ZCodeProjectWorkspace | undefined,
): boolean {
  return (
    workspace === undefined ||
    JSON.stringify(workspace) === JSON.stringify(runtime.config.projectWorkspace)
  );
}

/** 只刷新上下文前缀，保留已有会话 cwd、对话历史、队列和工具权限。 */
export async function applyTurnProjectWorkspace(
  runtime: AgentRuntimeInternal,
  workspace: ZCodeProjectWorkspace | undefined,
  trace: TraceContext,
): Promise<void> {
  if (!workspace || usesCurrentProjectWorkspace(runtime, workspace)) return;
  await bindWorkspaceProject(runtime, workspace);
  if (!runtime.contextInitialized || !runtime.contextSourcePort) {
    runtime.config.projectWorkspace = structuredClone(workspace);
    return;
  }
  const snapshot = await runtime.contextSourcePort.resolveContextSources({
    workingDirectory: runtime.workingDirectory,
    projectDirectories: workspace.directories,
    currentDate: runtime.config.currentDate,
    envInfo: runtime.contextSourceSnapshot?.envInfo,
    userInstructions: runtime.config.userInstructions
      ? {
          ...runtime.config.userInstructions,
          workingDirectory:
            runtime.config.userInstructions.workingDirectory ?? runtime.workspaceRoot,
        }
      : undefined,
    projectContext: runtime.config.projectContext,
    trace,
  });
  runtime.config.projectWorkspace = structuredClone(workspace);
  runtime.contextSourceSnapshot = snapshot;
}
