import { BarChart3, KeyRound, Package, PanelsTopLeft } from "lucide-react";
import { TID_SETTINGS_SECTION_NAV, testId } from "@zcode/shared/test-ids";
import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { EnvironmentNavigationProps } from "./contract.js";

const entries = [
  {
    id: "agents",
    label: "agentApplications.title",
    testId: "environment-agent-applications",
    Icon: PanelsTopLeft,
  },
  {
    id: "accounts",
    label: "accountManagement.title",
    testId: "environment-account-management",
    Icon: KeyRound,
  },
  {
    id: "modelProvider",
    label: "settings.modelProviderTitle",
    testId: testId(TID_SETTINGS_SECTION_NAV, "modelProvider"),
    Icon: Package,
  },
  {
    id: "usage",
    label: "settings.usageTitle",
    testId: testId(TID_SETTINGS_SECTION_NAV, "usage"),
    Icon: BarChart3,
  },
] as const;

export function EnvironmentNavigation({
  section,
  onSelect,
  className,
}: EnvironmentNavigationProps) {
  const { intl } = useZCodeIntl();
  return (
    <nav
      className={cn("@container/environment-navigation mt-3 space-y-1 px-2", className)}
      aria-label={intl.formatMessage({ id: "workspaceNavigation.environment" })}
    >
      {entries.map(({ id, label, Icon, testId }) => (
        <Button
          key={id}
          type="button"
          variant="ghost"
          size="lg"
          data-testid={testId}
          data-settings-section-nav={id}
          aria-current={section === id ? "page" : undefined}
          className={cn(
            "w-full justify-start gap-2 px-2.5 @max-[8rem]/environment-navigation:justify-center",
            section === id && "bg-selected hover:bg-selected",
          )}
          onClick={() => onSelect(id)}
        >
          <Icon aria-hidden="true" className="size-4" />
          <span className="min-w-0 truncate @max-[8rem]/environment-navigation:sr-only">
            {intl.formatMessage({ id: label })}
          </span>
        </Button>
      ))}
    </nav>
  );
}
