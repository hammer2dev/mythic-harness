import type { VirtualProject } from "#src/project-storage/contract.js";

export function assertRemoteProjectRoots(
  ownerHostId: string | undefined,
  roots: readonly string[],
): void {
  if (ownerHostId && ownerHostId !== "local" && roots.length === 0) {
    throw new Error("project.primary-root-missing");
  }
}

/** Newly admitted remote tasks may use only directories saved on the owning Host's project. */
export function assertRemoteTaskDirectories(
  ownerHostId: string | undefined,
  project: VirtualProject | null | undefined,
  workspacePath: string,
  additionalDirectories: readonly string[] = [],
): void {
  if (!ownerHostId || ownerHostId === "local") return;
  if (!project || project.hostId !== ownerHostId)
    throw new Error("project.remote-project-required");
  const roots = new Set(project.roots.map((root) => root.rootPath));
  if (!roots.has(workspacePath) || additionalDirectories.some((root) => !roots.has(root))) {
    throw new Error("project.cwd-not-in-roots");
  }
}
