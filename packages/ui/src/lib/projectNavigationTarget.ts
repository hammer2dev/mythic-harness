import type { WorkspaceProjectScope } from "@zcode/shared";
import { isWorkspaceTab, type TabStoreState, type WorkspaceTabState } from "@/store/tabStore.js";
import { findWorkspaceProjectScope } from "@/lib/workspaceProject.js";

/** 显式任务归属优先；侧栏预选的项目不能再被同路径的第一个项目覆盖。 */
export function resolveProjectNavigationTarget(
  state: Pick<TabStoreState, "tabs" | "activeTabId">,
  scope: WorkspaceProjectScope,
  projectId?: string,
): { tab: WorkspaceTabState; scope: WorkspaceProjectScope } | undefined {
  const workspaces = state.tabs.filter(isWorkspaceTab);
  const tab = projectId
    ? workspaces.find((item) => item.project?.id === projectId)
    : (workspaces.find(
        (item) => item.id === state.activeTabId && findWorkspaceProjectScope(item, scope),
      ) ?? workspaces.find((item) => findWorkspaceProjectScope(item, scope)));
  if (!tab) return undefined;
  const targetScope = findWorkspaceProjectScope(tab, scope);
  return targetScope ? { tab, scope: targetScope } : undefined;
}
