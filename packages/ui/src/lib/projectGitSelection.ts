import type { WorkspaceProjectDefinition, WorkspaceProjectFolder } from "@zcode/shared";
import { getWorkspaceProjectPrimaryFolder } from "@/lib/workspaceProject.js";

export interface ProjectGitFolderSelection {
  projectId: string;
  folderId: string;
}

export function resolveProjectGitFolder(
  project: WorkspaceProjectDefinition | undefined,
  selection: ProjectGitFolderSelection | null,
  fallbackFolder: WorkspaceProjectFolder,
): WorkspaceProjectFolder {
  if (!project) return fallbackFolder;
  return (
    (selection?.projectId === project.id
      ? project.folders.find((folder) => folder.id === selection.folderId)
      : undefined) ?? getWorkspaceProjectPrimaryFolder(project)
  );
}
