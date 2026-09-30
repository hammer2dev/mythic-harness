import { Globe, Package, Server, Settings, Sparkles, User } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { PluginStoreSegment } from "@/settings/PluginStoreListView.js";

interface PluginStoreNavigationProps {
  page: "browse" | "installed" | "mcp" | "skill";
  segment?: PluginStoreSegment;
  onSelectSegment: (segment: PluginStoreSegment) => void;
  onSelectManagement: (page: "installed" | "mcp" | "skill") => void;
  onOpenSources: () => void;
}

export function PluginStoreNavigation({
  page,
  segment,
  onSelectSegment,
  onSelectManagement,
  onOpenSources,
}: PluginStoreNavigationProps) {
  const { intl } = useZCodeIntl();
  return (
    <nav
      aria-label={intl.formatMessage({ id: "workspace.openPluginsSettings" })}
      data-testid="plugin-store-navigation"
      className="flex min-h-0 flex-1 flex-col px-2 py-3"
    >
      <h2 className="px-2 pb-2 text-ui-lg font-semibold">
        {intl.formatMessage({ id: "workspace.openPluginsSettings" })}
      </h2>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <h3 className="px-2 pb-2 pt-3 text-ui-xs font-medium text-foreground-subtlest">
          {intl.formatMessage({ id: "settings.plugins.store.discover" })}
        </h3>
        <div className="space-y-0.5">
          <NavigationButton
            active={page === "browse" && segment === "public"}
            testId="plugin-store-segment-public"
            onClick={() => onSelectSegment("public")}
          >
            <Globe className="size-4 shrink-0" aria-hidden="true" />
            {intl.formatMessage({ id: "settings.plugins.store.browse" })}
          </NavigationButton>
          <NavigationButton
            active={page === "browse" && segment === "personal"}
            testId="plugin-store-segment-personal"
            onClick={() => onSelectSegment("personal")}
          >
            <User className="size-4 shrink-0" aria-hidden="true" />
            {intl.formatMessage({ id: "settings.plugins.store.personalSources" })}
          </NavigationButton>
        </div>
        <h3 className="px-2 pb-2 pt-6 text-ui-xs font-medium text-foreground-subtlest">
          {intl.formatMessage({ id: "settings.plugins.store.manage" })}
        </h3>
        <div className="space-y-0.5">
          <NavigationButton
            active={page === "installed"}
            testId="plugin-store-manage-open"
            onClick={() => onSelectManagement("installed")}
          >
            <Package className="size-4 shrink-0" aria-hidden="true" />
            {intl.formatMessage({ id: "settings.plugins.store.installedPage" })}
          </NavigationButton>
          <NavigationButton
            active={page === "mcp"}
            testId="plugin-store-mcp-open"
            onClick={() => onSelectManagement("mcp")}
          >
            <Server className="size-4 shrink-0" aria-hidden="true" />
            {intl.formatMessage({ id: "settings.mcpTitle" })}
          </NavigationButton>
          <NavigationButton
            active={page === "skill"}
            testId="plugin-store-skills-open"
            onClick={() => onSelectManagement("skill")}
          >
            <Sparkles className="size-4 shrink-0" aria-hidden="true" />
            {intl.formatMessage({ id: "settings.skills.title" })}
          </NavigationButton>
        </div>
      </div>
      <div className="mt-3 space-y-0.5 border-t border-border pt-2">
        <NavigationButton testId="plugin-store-sources-open" onClick={onOpenSources}>
          <Settings className="size-4 shrink-0" aria-hidden="true" />
          {intl.formatMessage({ id: "settings.plugins.store.sources.title" })}
        </NavigationButton>
      </div>
    </nav>
  );
}

function NavigationButton({
  active,
  testId,
  onClick,
  children,
}: {
  active?: boolean;
  testId: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      data-testid={testId}
      aria-current={active ? "page" : undefined}
      className={cn(
        "w-full justify-start gap-2 text-ui-base font-normal",
        active ? "bg-selected text-foreground" : "text-foreground-subtle",
      )}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
