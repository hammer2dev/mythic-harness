import { useCallback } from "react";
import type { ZCodeProjectWorkspace } from "@zcode/shared";
import { useTabStoreApi } from "@/store/TabStoreProvider.js";
import { isWorkspaceTab } from "@/store/tabStore.js";
import {
  getWorkspaceProjectPrimaryFolder,
  isWorkspaceProjectScope,
} from "@/lib/workspaceProject.js";
import { taskBelongsToProject } from "@/lib/projectTaskMembership.js";

export function useProjectWorkspaceSnapshot(workspacePath: string, workspaceIdentity?: string) {
  const tabStore = useTabStoreApi();
  return useCallback(
    (projectId?: string, draft = false): ZCodeProjectWorkspace | undefined => {
      const state = tabStore.getState();
      const scope = { workspacePath, workspaceIdentity };
      const tabs = state.tabs.filter(isWorkspaceTab);
      const active = tabs.find((tab) => tab.id === state.activeTabId);
      const tab = projectId
        ? tabs.find(
            (item) => item.project?.id === projectId && isWorkspaceProjectScope(item, scope),
          )
        : draft && active?.project && isWorkspaceProjectScope(active, scope)
          ? active
          : tabs.find((item) => item.project && taskBelongsToProject(item.project, scope));
      if (!tab?.project) return undefined;
      const project = tab.project;
      return {
        projectId: project.id,
        name: project.name,
        primaryDirectory: getWorkspaceProjectPrimaryFolder(project).workspacePath,
        directories: project.folders.map((folder) => folder.workspacePath),
      };
    },
    [tabStore, workspacePath, workspaceIdentity],
  );
}
