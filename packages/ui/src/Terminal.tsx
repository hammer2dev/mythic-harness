import { Columns2, Rows2, Plus, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { IServiceAccessor } from "@zcode/services";
import { TID_TERMINAL } from "@zcode/shared/test-ids";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useIsOfficeMode } from "@/hooks/useInterfaceMode.js";
import { logger } from "@/logger.js";
import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import { getPathLeaf } from "@/lib/path.js";
import { TerminalTabTrigger } from "@/terminal/TerminalTabTrigger.js";
import { TerminalSession } from "@/terminal/TerminalSession.js";
import {
  addWorkspaceTerminal,
  closeTerminalSession,
  createWorkspaceTerminalState,
  ensureWorkspaceTerminalState,
  getActiveTerminalGroup,
  formatTerminalTabTitle,
  MAX_TERMINALS_PER_GROUP,
  type TerminalSplitDirection,
  type TerminalPanelState,
  type TerminalSessionDescriptor,
} from "@/terminal/terminalPanelState.js";

export function Terminal({
  services,
  cwd,
  workspaceIdentity,
  openWorkspaceKeys,
  isVisible,
  isPanelResizing = false,
  isWindowsDesktop = false,
  onClose,
  onOpenBrowserUrl,
}: {
  services: IServiceAccessor;
  cwd?: string;
  workspaceIdentity?: string;
  openWorkspaceKeys?: string[];
  isVisible: boolean;
  isPanelResizing?: boolean;
  isWindowsDesktop?: boolean;
  onClose: () => void;
  onOpenBrowserUrl: (url: string) => void;
}) {
  const { intl } = useZCodeIntl();
  const isOfficeMode = useIsOfficeMode();
  const workspaceKey = workspaceIdentity?.trim() || cwd || "__default__";
  const [panelState, setPanelState] = useState<TerminalPanelState>(() => {
    const { session, workspace } = createWorkspaceTerminalState({
      workspaceKey,
      services,
      cwd,
    });
    return {
      sessions: {
        [session.id]: session,
      },
      workspaces: {
        [workspaceKey]: workspace,
      },
    };
  });
  const activeTerminalRef = useRef<{ focus: () => void }>(null);
  const groupListRef = useRef<HTMLElement>(null);
  const closePanelAfterSessionRemovalWorkspaceRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    // 终端会话按 workspace identity 隔离保存，切换 workspace 时只切换可见组，
    // 不卸载旧 workspace 的 xterm/PTY，避免长时间运行的命令因为 React 生命周期变化被杀掉。
    // PTY exit 会删除最后一个 session；面板下次重新打开时也通过这里懒创建新终端。
    setPanelState((current) =>
      ensureWorkspaceTerminalState(current, {
        workspaceKey,
        services,
        cwd,
      }),
    );
  }, [cwd, isVisible, services, workspaceKey]);

  useEffect(() => {
    const removedWorkspaceKey = closePanelAfterSessionRemovalWorkspaceRef.current;
    if (!removedWorkspaceKey) {
      return;
    }

    closePanelAfterSessionRemovalWorkspaceRef.current = null;
    if (removedWorkspaceKey === workspaceKey) {
      onClose();
    }
  }, [onClose, panelState, workspaceKey]);

  useEffect(() => {
    if (!openWorkspaceKeys) {
      return;
    }

    // 终端现在会跨 workspace 切换保活，但 workspace tab 被真正关闭后，
    // 对应的隐藏终端不能继续占着 PTY 进程；这里按仍打开的 workspace key 做回收。
    const retainedWorkspaceKeys = new Set(openWorkspaceKeys);
    retainedWorkspaceKeys.add(workspaceKey);
    setPanelState((current) => {
      const removedWorkspaces = Object.entries(current.workspaces).filter(
        ([key]) => !retainedWorkspaceKeys.has(key),
      );
      if (removedWorkspaces.length === 0) {
        return current;
      }

      const nextWorkspaces = { ...current.workspaces };
      const nextSessions = { ...current.sessions };
      for (const [removedWorkspaceKey, { groups }] of removedWorkspaces) {
        delete nextWorkspaces[removedWorkspaceKey];
        for (const group of groups) {
          for (const sessionId of group.sessionIds) delete nextSessions[sessionId];
        }
      }

      return {
        sessions: nextSessions,
        workspaces: nextWorkspaces,
      };
    });
  }, [openWorkspaceKeys, workspaceKey]);

  const handleShellLabelChange = useCallback((sessionId: string, shellLabel: string | null) => {
    setPanelState((current) => {
      const session = current.sessions[sessionId];
      if (!session || session.shellLabel === shellLabel) {
        return current;
      }

      return {
        ...current,
        sessions: {
          ...current.sessions,
          [sessionId]: {
            ...session,
            shellLabel,
          },
        },
      };
    });
  }, []);

  const handleCreateSession = (direction?: TerminalSplitDirection) => {
    setPanelState((current) =>
      addWorkspaceTerminal(current, { workspaceKey, services, cwd }, direction),
    );
  };

  const handleCloseSession = useCallback(
    (sessionId: string, exitCode?: number) => {
      setPanelState((current) => {
        const next = closeTerminalSession(current, sessionId);
        if (next === current) return current;

        const removedKey = current.sessions[sessionId]!.workspaceKey;
        if (removedKey === workspaceKey && !next.workspaces[removedKey]) {
          closePanelAfterSessionRemovalWorkspaceRef.current = removedKey;
        }
        logger.info("[Terminal] removed session", {
          terminalTabId: sessionId,
          workspaceKey: removedKey,
          exitCode,
        });
        return next;
      });
    },
    [workspaceKey],
  );

  const handleActivateSession = useCallback((sessionId: string) => {
    setPanelState((current) => {
      const session = current.sessions[sessionId];
      if (!session) {
        return current;
      }

      const workspace = current.workspaces[session.workspaceKey];
      if (!workspace || workspace.activeSessionId === sessionId) {
        return current;
      }

      return {
        ...current,
        workspaces: {
          ...current.workspaces,
          [session.workspaceKey]: {
            ...workspace,
            activeSessionId: sessionId,
          },
        },
      };
    });
  }, []);

  const workspace = panelState.workspaces[workspaceKey];
  const activeGroup = workspace && getActiveTerminalGroup(workspace);
  const activeSession = workspace && panelState.sessions[workspace.activeSessionId];
  const hasSidebar =
    workspace && activeGroup && (workspace.groups.length > 1 || activeGroup.sessionIds.length > 1);
  const atLimit = activeGroup?.sessionIds.length === MAX_TERMINALS_PER_GROUP;
  const selectedId = activeSession?.id;
  useLayoutEffect(() => {
    const list = groupListRef.current;
    if (!isVisible || !hasSidebar || !list) return;
    const selectedRow = list.querySelector(`[data-terminal-select="${selectedId}"]`)?.parentElement;
    if (!selectedRow) return;
    // 手机横向、桌面纵向滚动整行，让选中的名称、编号和关闭按钮一起进入视野。
    const observer = new ResizeObserver(() =>
      selectedRow.scrollIntoView({ block: "nearest", inline: "nearest" }),
    );
    observer.observe(list);
    return () => observer.disconnect();
  }, [hasSidebar, isVisible, selectedId]);
  const nameOf = (session: TerminalSessionDescriptor) =>
    getPathLeaf(session.cwd ?? "") || intl.formatMessage({ id: "terminal.title" });
  const titleOf = (session: TerminalSessionDescriptor) =>
    formatTerminalTabTitle(nameOf(session), session.index);

  const selectSession = (id: string) => {
    if (id === activeSession?.id) activeTerminalRef.current?.focus();
    else handleActivateSession(id);
  };

  const actions = [
    ...(!isOfficeMode
      ? [
          {
            action: "split-right",
            label: intl.formatMessage({ id: "terminal.splitRight" }),
            Icon: Columns2,
            disabled: atLimit,
            run: () => handleCreateSession("horizontal"),
          },
          {
            action: "split-down",
            label: intl.formatMessage({ id: "terminal.splitDown" }),
            Icon: Rows2,
            disabled: atLimit,
            run: () => handleCreateSession("vertical"),
          },
          {
            action: "new-group",
            label: intl.formatMessage({ id: "terminal.newGroup" }),
            Icon: Plus,
            run: () => handleCreateSession(),
          },
        ]
      : []),
    {
      action: "close-session",
      label: activeSession
        ? intl.formatMessage({ id: "terminal.closeTab" }, { title: titleOf(activeSession) })
        : "",
      Icon: Trash2,
      disabled: !activeSession,
      run: () => activeSession && handleCloseSession(activeSession.id),
    },
  ];

  return (
    <section
      data-testid={TID_TERMINAL}
      aria-label={intl.formatMessage({ id: "terminal.title" })}
      className={cn(
        "flex h-full min-h-0 min-w-0 overflow-hidden bg-background",
        hasSidebar ? "flex-row-reverse compact-web:flex-col" : "flex-col",
      )}
    >
      <div
        className={cn(
          "flex min-h-0 shrink-0 flex-col",
          hasSidebar &&
            "w-36 max-w-[45%] border-l border-border compact-web:w-full compact-web:max-w-none compact-web:border-l-0 compact-web:border-b",
        )}
      >
        <div className="flex min-h-7 flex-wrap items-center justify-end border-b border-border px-1">
          {!hasSidebar && activeSession && (
            <div className="flex min-w-0 flex-1 items-center gap-2 px-1.5 text-ui-caption">
              <span className="truncate" title={titleOf(activeSession)}>
                {titleOf(activeSession)}
              </span>
              <span className="shrink-0 text-foreground-subtle">{activeSession.shellLabel}</span>
            </div>
          )}
          {actions.map(({ action, label, Icon, disabled, run }) => (
            <Button
              key={action}
              data-terminal-action={action}
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={disabled}
              aria-label={label}
              title={
                disabled && atLimit
                  ? intl.formatMessage(
                      { id: "terminal.splitLimit" },
                      { count: MAX_TERMINALS_PER_GROUP },
                    )
                  : label
              }
              onClick={run}
            >
              <Icon className="size-3.5" />
            </Button>
          ))}
        </div>
        {hasSidebar && (
          <nav
            ref={groupListRef}
            aria-label={intl.formatMessage({ id: "terminal.groups" })}
            className="min-h-0 overflow-y-auto p-1 compact-web:flex compact-web:gap-2 compact-web:overflow-x-auto"
          >
            {workspace.groups.map((group) => {
              const single = group.sessionIds.length === 1;
              const stacked = group.direction === "vertical";
              const GroupIcon = single ? Square : stacked ? Rows2 : Columns2;
              const label = intl.formatMessage({
                id: single
                  ? "terminal.single"
                  : stacked
                    ? "terminal.stacked"
                    : "terminal.sideBySide",
              });
              return (
                <div
                  key={group.id}
                  data-terminal-group={group.id}
                  className="mb-1 last:mb-0 compact-web:mb-0 compact-web:flex compact-web:shrink-0 compact-web:items-center"
                >
                  <button
                    type="button"
                    className={cn(
                      "flex h-6 w-full items-center gap-1 rounded-md px-1.5 text-ui-sm text-foreground-subtle hover:bg-hover focus-visible:outline-ring compact-web:w-auto",
                      group === activeGroup && "text-foreground",
                    )}
                    aria-pressed={group === activeGroup}
                    onClick={() =>
                      selectSession(
                        group === activeGroup ? workspace.activeSessionId : group.sessionIds[0]!,
                      )
                    }
                  >
                    <GroupIcon className="size-3 shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-left">{label}</span>
                    <span className="tabular-nums">{group.sessionIds.length}</span>
                  </button>
                  {group.sessionIds.map((id) => {
                    const session = panelState.sessions[id]!;
                    return (
                      <TerminalTabTrigger
                        key={id}
                        sessionId={id}
                        name={nameOf(session)}
                        index={session.index}
                        isActive={id === workspace.activeSessionId}
                        onSelect={selectSession}
                        onClose={handleCloseSession}
                      />
                    );
                  })}
                </div>
              );
            })}
          </nav>
        )}
      </div>

      <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
        {Object.values(panelState.workspaces).flatMap(({ groups }) =>
          groups.map((group) => {
            const shown = isVisible && group === activeGroup;
            const vertical = group.direction === "vertical";
            const tracks = `repeat(${group.sessionIds.length}, minmax(0, 1fr))`;
            return (
              <div
                key={group.id}
                className={cn("h-full min-h-0 min-w-0", shown ? "grid" : "hidden")}
                style={
                  vertical
                    ? { gridTemplateRows: tracks, gridTemplateColumns: "minmax(0, 1fr)" }
                    : { gridTemplateColumns: tracks, gridTemplateRows: "minmax(0, 1fr)" }
                }
              >
                {group.sessionIds.map((id, index) => {
                  const session = panelState.sessions[id]!;
                  const active = shown && id === activeSession?.id;
                  return (
                    <div
                      key={id}
                      id={`terminal-pane-${id}`}
                      data-terminal-pane={id}
                      data-active={active ? "" : undefined}
                      role="group"
                      aria-label={titleOf(session)}
                      className={cn(
                        "min-h-0 min-w-0 overflow-hidden p-1",
                        index > 0 &&
                          (vertical ? "border-t border-border" : "border-l border-border"),
                      )}
                      onPointerDownCapture={() => {
                        if (!active) handleActivateSession(id);
                      }}
                      onFocusCapture={() => {
                        if (!active) handleActivateSession(id);
                      }}
                    >
                      <TerminalSession
                        ref={active ? activeTerminalRef : undefined}
                        sessionId={id}
                        services={session.services}
                        cwd={session.cwd}
                        isVisible={shown}
                        isActive={active}
                        isPanelResizing={isPanelResizing}
                        isWindowsDesktop={isWindowsDesktop}
                        onShellLabelChange={handleShellLabelChange}
                        onExit={handleCloseSession}
                        onOpenBrowserUrl={onOpenBrowserUrl}
                      />
                    </div>
                  );
                })}
              </div>
            );
          }),
        )}
      </div>
    </section>
  );
}
