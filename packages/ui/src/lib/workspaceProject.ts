import {
  createUuid,
  buildRemoteWorkspaceIdentity,
  getRemoteWorkspaceEnvironmentIdentity,
  type RemoteTarget,
  type WorkspaceProjectDefinition,
  type WorkspaceProjectFolder,
  type WorkspaceProjectScope,
} from "@zcode/shared";

interface ProjectWorkspace extends WorkspaceProjectScope {
  project?: WorkspaceProjectDefinition;
}

export type WorkspaceProjectUpdate = Pick<
  WorkspaceProjectDefinition,
  "name" | "folders" | "primaryFolderId"
>;

export function getWorkspaceProjectKey(workspace: ProjectWorkspace): string {
  return workspace.project?.id ?? (workspace.workspaceIdentity?.trim() || workspace.workspacePath);
}

export function getWorkspaceProjectPrimaryFolder(
  project: WorkspaceProjectDefinition,
): WorkspaceProjectFolder {
  const primary = project.folders.find((folder) => folder.id === project.primaryFolderId);
  if (!primary) throw new Error("项目需要一个有效的主文件夹");
  return primary;
}

export function getWorkspaceProjectScopes(workspace: ProjectWorkspace): WorkspaceProjectScope[] {
  return workspace.project?.taskWorkspaceScopes ?? [toWorkspaceProjectScope(workspace)];
}

export function isWorkspaceProjectScope(
  workspace: ProjectWorkspace,
  scope: WorkspaceProjectScope,
): boolean {
  const key = scope.workspaceIdentity?.trim() || scope.workspacePath;
  const scopes = [
    workspace,
    ...(workspace.project?.folders ?? []),
    ...getWorkspaceProjectScopes(workspace),
  ];
  return scopes.some(
    (candidate) => (candidate.workspaceIdentity?.trim() || candidate.workspacePath) === key,
  );
}

export function findWorkspaceProjectScope(
  workspace: ProjectWorkspace,
  scope: WorkspaceProjectScope,
): WorkspaceProjectScope | undefined {
  const scopes = [
    workspace,
    ...(workspace.project?.folders ?? []),
    ...getWorkspaceProjectScopes(workspace),
  ];
  return scopes.find((candidate) =>
    scope.workspaceIdentity?.trim()
      ? candidate.workspaceIdentity?.trim() === scope.workspaceIdentity.trim()
      : candidate.workspacePath === scope.workspacePath,
  );
}

export function toWorkspaceProjectScope(scope: WorkspaceProjectScope): WorkspaceProjectScope {
  return {
    workspacePath: scope.workspacePath,
    ...(scope.workspaceIdentity ? { workspaceIdentity: scope.workspaceIdentity } : {}),
  };
}

export function createWorkspaceProject(
  scope: WorkspaceProjectScope,
  name: string,
): WorkspaceProjectDefinition {
  const folder = { id: createUuid(), ...toWorkspaceProjectScope(scope) };
  return {
    id: createUuid(),
    name,
    folders: [folder],
    primaryFolderId: folder.id,
    legacyWorkspaceScopes: [toWorkspaceProjectScope(scope)],
    taskWorkspaceScopes: [toWorkspaceProjectScope(scope)],
  };
}

export function updateWorkspaceProjectDefinition(
  project: WorkspaceProjectDefinition,
  update: WorkspaceProjectUpdate,
  remoteTarget?: RemoteTarget,
): WorkspaceProjectDefinition {
  const name = update.name.trim();
  if (!name || update.folders.length === 0) throw new Error("项目名称和源文件夹不能为空");
  const folders = update.folders.map((folder) => ({
    id: folder.id,
    workspacePath: folder.workspacePath.trim(),
    ...(remoteTarget
      ? {
          workspaceIdentity: buildRemoteWorkspaceIdentity(
            folder.workspacePath.trim(),
            remoteTarget,
          ),
        }
      : folder.workspaceIdentity
        ? { workspaceIdentity: folder.workspaceIdentity }
        : {}),
  }));
  const keys = folders.map((folder) => folder.workspaceIdentity?.trim() || folder.workspacePath);
  if (
    folders.some((folder) => !folder.id || !folder.workspacePath) ||
    new Set(folders.map((folder) => folder.id)).size !== folders.length ||
    new Set(keys).size !== folders.length
  ) {
    throw new Error("源文件夹必须是互不重复的有效目录");
  }
  const currentPrimary = getWorkspaceProjectPrimaryFolder(project);
  const environment = currentPrimary.workspaceIdentity
    ? getRemoteWorkspaceEnvironmentIdentity(currentPrimary.workspaceIdentity)
    : null;
  if (
    folders.some((folder) =>
      environment
        ? !folder.workspaceIdentity ||
          getRemoteWorkspaceEnvironmentIdentity(folder.workspaceIdentity) !== environment
        : Boolean(folder.workspaceIdentity),
    )
  ) {
    throw new Error("一个项目的源文件夹必须位于同一执行环境");
  }
  const next = { ...project, name, folders, primaryFolderId: update.primaryFolderId };
  const primary = getWorkspaceProjectPrimaryFolder(next);
  const primaryKey = primary.workspaceIdentity?.trim() || primary.workspacePath;
  const taskWorkspaceScopes = project.taskWorkspaceScopes.some(
    (scope) => (scope.workspaceIdentity?.trim() || scope.workspacePath) === primaryKey,
  )
    ? project.taskWorkspaceScopes
    : [...project.taskWorkspaceScopes, toWorkspaceProjectScope(primary)];
  return { ...next, taskWorkspaceScopes };
}
