import type { IServiceAccessor } from "@zcode/services";
import { createUuid } from "@zcode/shared";

export interface TerminalSessionDescriptor {
  id: string;
  workspaceKey: string;
  services: IServiceAccessor;
  cwd?: string;
  index: number;
  shellLabel: string | null;
}

export type TerminalSplitDirection = "horizontal" | "vertical";
export const MAX_TERMINALS_PER_GROUP = 4;

export interface TerminalGroup {
  id: string;
  direction: TerminalSplitDirection;
  sessionIds: string[];
}

export interface TerminalWorkspaceState {
  groups: TerminalGroup[];
  activeSessionId: string;
}

export interface TerminalPanelState {
  sessions: Record<string, TerminalSessionDescriptor>;
  workspaces: Record<string, TerminalWorkspaceState>;
}

interface TerminalLaunch {
  workspaceKey: string;
  services: IServiceAccessor;
  cwd?: string;
}

function createTerminalSession(params: TerminalLaunch, index: number): TerminalSessionDescriptor {
  return {
    id: createUuid(),
    workspaceKey: params.workspaceKey,
    services: params.services,
    cwd: params.cwd,
    index,
    shellLabel: null,
  };
}

function singleTerminalGroup(sessionId: string): TerminalGroup {
  return { id: sessionId, direction: "horizontal", sessionIds: [sessionId] };
}

export function createWorkspaceTerminalState(params: TerminalLaunch): {
  session: TerminalSessionDescriptor;
  workspace: TerminalWorkspaceState;
} {
  const session = createTerminalSession(params, 1);

  return {
    session,
    workspace: {
      groups: [singleTerminalGroup(session.id)],
      activeSessionId: session.id,
    },
  };
}

function getNextTerminalSessionIndex(state: TerminalPanelState, workspaceKey: string): number {
  const usedIndices = new Set(
    Object.values(state.sessions)
      .filter((session) => session.workspaceKey === workspaceKey)
      .map((session) => session.index),
  );

  // 把 nextIndex 作为只增不减的派生状态保存，会让关闭编号 2 后再新建错误地得到 3。
  // 编号事实已经存在于 session descriptor 中，创建时从现存 session 推导最小空位，避免两份状态漂移。
  for (let index = 1; ; index += 1) {
    if (!usedIndices.has(index)) {
      return index;
    }
  }
}

export function formatTerminalTabTitle(projectName: string, index: number): string {
  return index === 1 ? projectName : `${projectName} ${index}`;
}

export function getActiveTerminalGroup(workspace: TerminalWorkspaceState): TerminalGroup {
  return workspace.groups.find((group) => group.sessionIds.includes(workspace.activeSessionId))!;
}

export function addWorkspaceTerminal(
  state: TerminalPanelState,
  launch: TerminalLaunch,
  direction?: TerminalSplitDirection,
): TerminalPanelState {
  const workspace = state.workspaces[launch.workspaceKey];
  if (!workspace) return ensureWorkspaceTerminalState(state, launch);
  const activeGroup = getActiveTerminalGroup(workspace);
  if (direction && activeGroup.sessionIds.length >= MAX_TERMINALS_PER_GROUP) return state;

  const session = createTerminalSession(
    launch,
    getNextTerminalSessionIndex(state, launch.workspaceKey),
  );
  let groups: TerminalGroup[];
  if (direction) {
    const sessionIds = [...activeGroup.sessionIds];
    sessionIds.splice(sessionIds.indexOf(workspace.activeSessionId) + 1, 0, session.id);
    groups = workspace.groups.map((group) =>
      group === activeGroup ? { ...group, direction, sessionIds } : group,
    );
  } else {
    groups = [...workspace.groups, singleTerminalGroup(session.id)];
  }
  return {
    sessions: { ...state.sessions, [session.id]: session },
    workspaces: {
      ...state.workspaces,
      [launch.workspaceKey]: { groups, activeSessionId: session.id },
    },
  };
}

export function closeTerminalSession(
  state: TerminalPanelState,
  sessionId: string,
): TerminalPanelState {
  const session = state.sessions[sessionId];
  if (!session) return state;
  const workspace = state.workspaces[session.workspaceKey]!;
  const groupIndex = workspace.groups.findIndex((group) => group.sessionIds.includes(sessionId));
  const group = workspace.groups[groupIndex]!;
  const index = group.sessionIds.indexOf(sessionId);
  const sessionIds = group.sessionIds.filter((id) => id !== sessionId);
  const groups = workspace.groups.slice();
  if (sessionIds.length) groups[groupIndex] = { ...group, sessionIds };
  else groups.splice(groupIndex, 1);

  const { [sessionId]: _closedSession, ...nextSessions } = state.sessions;
  if (!groups.length) {
    const { [session.workspaceKey]: _closedWorkspace, ...nextWorkspaces } = state.workspaces;
    return {
      sessions: nextSessions,
      workspaces: nextWorkspaces,
    };
  }

  return {
    sessions: nextSessions,
    workspaces: {
      ...state.workspaces,
      [session.workspaceKey]: {
        groups,
        activeSessionId:
          workspace.activeSessionId === sessionId
            ? (sessionIds[index] ??
              sessionIds[index - 1] ??
              groups[Math.min(groupIndex, groups.length - 1)]!.sessionIds[0]!)
            : workspace.activeSessionId,
      },
    },
  };
}

export function ensureWorkspaceTerminalState(
  state: TerminalPanelState,
  params: TerminalLaunch,
): TerminalPanelState {
  if (state.workspaces[params.workspaceKey]) return state;

  const { session, workspace } = createWorkspaceTerminalState(params);
  return {
    sessions: {
      ...state.sessions,
      [session.id]: session,
    },
    workspaces: {
      ...state.workspaces,
      [params.workspaceKey]: workspace,
    },
  };
}
