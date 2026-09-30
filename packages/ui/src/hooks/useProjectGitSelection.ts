import { useCallback, useMemo, useState } from "react";
import type { WorkspaceProjectFolder } from "@zcode/shared";
import { useTabStore } from "@/store/TabStoreProvider.js";
import { isWorkspaceTab } from "@/store/tabStore.js";
import {
  resolveProjectGitFolder,
  type ProjectGitFolderSelection,
} from "@/lib/projectGitSelection.js";

export interface ProjectGitSelection {
  folders: WorkspaceProjectFolder[];
  folder: WorkspaceProjectFolder;
  selectFolder: (folderId: string) => void;
}

export function useProjectGitSelection(
  workspacePath: string,
  workspaceIdentity?: string,
): ProjectGitSelection {
  const project = useTabStore((state) => {
    const tab = state.tabs.find((item) => item.id === state.activeTabId);
    return tab && isWorkspaceTab(tab) ? tab.project : undefined;
  });
  const [selection, setSelection] = useState<ProjectGitFolderSelection | null>(null);
  const fallbackFolder = useMemo(
    () => ({ id: workspaceIdentity?.trim() || workspacePath, workspacePath, workspaceIdentity }),
    [workspaceIdentity, workspacePath],
  );
  const projectId = project?.id ?? fallbackFolder.id;
  const folder = resolveProjectGitFolder(project, selection, fallbackFolder);
  const folders = useMemo(
    () => project?.folders ?? [fallbackFolder],
    [project?.folders, fallbackFolder],
  );
  const selectFolder = useCallback(
    (folderId: string) => setSelection({ projectId, folderId }),
    [projectId],
  );
  return useMemo(() => ({ folders, folder, selectFolder }), [folders, folder, selectFolder]);
}
