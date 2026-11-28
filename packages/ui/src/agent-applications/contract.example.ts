import type { EnvironmentNavigationProps, EnvironmentSection } from "./contract.js";

export function exampleEnvironmentNavigation(
  onSelect: (section: EnvironmentSection) => void,
): EnvironmentNavigationProps {
  return { section: "agents", onSelect };
}
