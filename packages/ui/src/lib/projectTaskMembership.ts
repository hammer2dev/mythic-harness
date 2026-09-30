import type { WorkspaceProjectDefinition } from "@zcode/shared";

interface ProjectTaskScope {
  workspacePath: string;
  workspaceIdentity?: string;
  projectId?: string;
}

export function taskBelongsToProject(
  project: WorkspaceProjectDefinition,
  task: ProjectTaskScope,
): boolean {
  const scopes = task.projectId ? project.taskWorkspaceScopes : project.legacyWorkspaceScopes;
  if (task.projectId && task.projectId !== project.id) return false;
  const taskKey = task.workspaceIdentity?.trim() || task.workspacePath;
  return scopes.some(
    (scope) => (scope.workspaceIdentity?.trim() || scope.workspacePath) === taskKey,
  );
}
