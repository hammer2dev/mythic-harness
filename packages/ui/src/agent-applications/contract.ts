import type { EnvironmentWorkspaceSection } from "@/app-shell/types.js";

export type EnvironmentSection = EnvironmentWorkspaceSection | "modelProvider" | "usage";

export interface EnvironmentNavigationProps {
  section: EnvironmentSection;
  onSelect(section: EnvironmentSection): void;
  className?: string;
}
