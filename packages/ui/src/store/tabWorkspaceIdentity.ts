import type { WorkspaceProjectDefinition } from "@zcode/shared";
import { getWorkspaceProjectScopes } from "@/lib/workspaceProject.js";

interface WorkspaceTabIdentityLike {
  workspacePath: string;
  remoteSessionId?: string;
  workspaceIdentity?: string;
  project?: WorkspaceProjectDefinition;
}

interface WorkspaceTabMatchOptions {
  remoteSessionId?: string;
  workspaceIdentity?: string;
  project?: WorkspaceProjectDefinition;
}

function hasRemoteTabIdentity(tab: WorkspaceTabIdentityLike): boolean {
  return Boolean(tab.workspaceIdentity || tab.remoteSessionId);
}

function isLocalWorkspaceTab(tab: WorkspaceTabIdentityLike): boolean {
  return !hasRemoteTabIdentity(tab);
}

export function isSameWorkspaceTab(
  tab: WorkspaceTabIdentityLike,
  workspacePath: string,
  options?: WorkspaceTabMatchOptions,
): boolean {
  if (options?.project && tab.project) return options.project.id === tab.project.id;
  if (
    tab.project &&
    getWorkspaceProjectScopes(tab).some(
      (scope) =>
        (scope.workspaceIdentity?.trim() || scope.workspacePath) ===
        (options?.workspaceIdentity?.trim() || workspacePath),
    )
  )
    return true;
  if (
    tab.project &&
    options?.remoteSessionId &&
    tab.remoteSessionId === options.remoteSessionId &&
    getWorkspaceProjectScopes(tab).some(
      (scope) =>
        scope.workspacePath === workspacePath &&
        (!options.workspaceIdentity || scope.workspaceIdentity === options.workspaceIdentity),
    )
  )
    return true;
  if (tab.workspacePath !== workspacePath) {
    return false;
  }

  if (options?.workspaceIdentity) {
    return tab.workspaceIdentity === options.workspaceIdentity;
  }

  if (options?.remoteSessionId) {
    return tab.remoteSessionId === options.remoteSessionId;
  }

  return isLocalWorkspaceTab(tab);
}
