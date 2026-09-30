import type { SavedWorkflowGroupMode } from "@/settings/saved-workflows/savedWorkflowContract.js";

export type SavedWorkflowsSelection =
  | { mode: "list" }
  | { mode: "detail"; scope: "project"; workspaceKey: string; name: string }
  | { mode: "detail"; scope: "global"; name: string };

export function resolveSavedWorkflowGroupMode(
  selection: SavedWorkflowsSelection,
  scope: "project" | "global",
  workspaceKey?: string,
): SavedWorkflowGroupMode {
  if (selection.mode === "list") return { kind: "list" };
  const selected =
    selection.scope === scope &&
    (selection.scope === "global" || selection.workspaceKey === workspaceKey);
  return selected ? { kind: "detail", name: selection.name } : { kind: "hidden" };
}
