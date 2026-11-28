import {
  CalendarClock,
  Cpu,
  Folder,
  GitBranch,
  Layers3,
  PanelLeftClose,
  PanelLeftOpen,
  Puzzle,
  Settings,
} from "lucide-react";
import { TID_TASK_SETTINGS_BUTTON } from "@zcode/shared/test-ids";
import appLogoUrl from "@/assets/app-logo.png";
import { Button } from "@/components/ui/button.js";
import { WORKSPACE_PAGE_TITLE_CLASSNAME } from "@/settings/SettingsPageParts.js";
import { cn } from "@/components/lib/utils.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useDynamicWorkflowAvailability } from "@/hooks/useDynamicWorkflowAvailability.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import type { EnvironmentWorkspaceSection, WorkspaceMainView } from "@/app-shell/types.js";
import { WorkspaceBotChannelsTrigger } from "@/web-remote-control/index.js";

export type WorkspacePrimaryView = WorkspaceMainView | "model-gateway" | "settings";
export const WORKSPACE_PRIMARY_NAVIGATION_WIDTH_PX = 48;

const MODULES = [
  { id: "chat", label: "workspaceSidebar.projectsSection", icon: Folder },
  { id: "automations", label: "workspaceNavigation.scheduledTasks", icon: CalendarClock },
  { id: "workflows", label: "workspaceNavigation.workflows", icon: GitBranch },
  { id: "plugin-store", label: "workspace.openPluginsSettings", icon: Puzzle },
  { id: "environment", label: "workspaceNavigation.environment", icon: Layers3 },
  { id: "model-gateway", label: "workspaceNavigation.modelGateway", icon: Cpu },
  { id: "settings", label: "settings.title", icon: Settings },
] as const;

export function WorkspaceSecondaryNavigationTitle({
  active,
  className,
}: {
  active: WorkspacePrimaryView;
  className?: string;
}) {
  const { intl } = useZCodeIntl();
  const module = MODULES.find(({ id }) => id === active);
  if (!module) return null;
  return (
    <h2
      className={cn("truncate px-4.5", WORKSPACE_PAGE_TITLE_CLASSNAME, className)}
      data-testid="workspace-secondary-navigation-title"
    >
      {intl.formatMessage({ id: module.label })}
    </h2>
  );
}

const EVENT = "zcode:workspace-primary-view";

interface WorkspacePrimaryViewRequest {
  view: WorkspaceMainView;
  environmentSection?: EnvironmentWorkspaceSection;
}

export function requestWorkspacePrimaryView(
  view: WorkspaceMainView,
  environmentSection?: EnvironmentWorkspaceSection,
): void {
  window.dispatchEvent(
    new CustomEvent<WorkspacePrimaryViewRequest>(EVENT, {
      detail: { view, environmentSection },
    }),
  );
}

export function addWorkspacePrimaryViewListener(
  onChange: (view: WorkspaceMainView, environmentSection?: EnvironmentWorkspaceSection) => void,
) {
  const listener = (event: Event) => {
    const { detail } = event as CustomEvent<WorkspacePrimaryViewRequest>;
    const view = detail?.view;
    if (
      view === "chat" ||
      view === "automations" ||
      view === "workflows" ||
      view === "plugin-store" ||
      view === "environment"
    ) {
      onChange(view, detail.environmentSection);
    }
  };
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}

export function WorkspacePrimaryNavigation({
  active,
  onSelect,
  hasWorkspace = true,
  isDesktop = false,
  sidebarToggle,
}: {
  active: WorkspacePrimaryView;
  onSelect(view: WorkspacePrimaryView): void;
  hasWorkspace?: boolean;
  isDesktop?: boolean;
  sidebarToggle?: { expanded: boolean; onToggle: () => void; shortcutLabel: string };
}) {
  const { intl } = useZCodeIntl();
  const { enabled: workflowEnabled } = useDynamicWorkflowAvailability();
  const toggleTitle = intl.formatMessage({ id: "workspaceSidebar.toggleSidebar" });
  const ToggleIcon = sidebarToggle?.expanded ? PanelLeftClose : PanelLeftOpen;
  const logo = (
    <img
      src={appLogoUrl}
      alt=""
      className={cn(
        "size-[22px]",
        sidebarToggle &&
          "transition-opacity duration-150 group-hover:opacity-0 group-focus-visible:opacity-0 motion-reduce:transition-none",
      )}
      draggable={false}
    />
  );

  return (
    <nav
      aria-label={intl.formatMessage({ id: "workspaceNavigation.label" })}
      data-testid="workspace-primary-navigation"
      style={{ width: WORKSPACE_PRIMARY_NAVIGATION_WIDTH_PX }}
      className="z-10 flex min-h-0 shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-border/50 bg-primary-navigation pb-2"
    >
      <div
        className={cn(
          "flex h-14 w-full shrink-0 items-center justify-center [app-region:drag] platform-windows-desktop:pt-1 platform-mac-desktop:items-end platform-mac-desktop:pb-2",
          // macOS 的可点击区域也要避开原生窗控，给 36px 按钮预留比静态 Logo 更高的空间。
          sidebarToggle ? "platform-mac-desktop:h-[88px]" : "platform-mac-desktop:h-[72px]",
        )}
      >
        {sidebarToggle ? (
          <ControlHintTooltip
            title={toggleTitle}
            shortcut={sidebarToggle.shortcutLabel}
            side="right"
          >
            <Button
              type="button"
              variant="ghost"
              size="icon-lg"
              className="group relative size-9 [app-region:no-drag] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/60 aria-expanded:bg-transparent aria-expanded:hover:bg-hover"
              data-testid="desktop-top-sidebar-toggle"
              aria-label={toggleTitle}
              aria-controls="sidebar"
              aria-expanded={sidebarToggle.expanded}
              onClick={sidebarToggle.onToggle}
            >
              {logo}
              <ToggleIcon
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 m-auto size-[18px] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
              />
            </Button>
          </ControlHintTooltip>
        ) : (
          logo
        )}
      </div>
      {MODULES.map(({ id, label, icon: Icon }) => {
        if (
          (!hasWorkspace && id !== "settings" && id !== "model-gateway" && id !== "environment") ||
          (id === "workflows" && !workflowEnabled) ||
          (id === "environment" && !isDesktop) ||
          (id === "model-gateway" && isDesktop)
        ) {
          return null;
        }
        const text = intl.formatMessage({ id: label });
        const button = (
          <ControlHintTooltip key={id} title={text} side="right">
            <Button
              variant="ghost"
              size="icon-lg"
              className={cn(
                "relative size-9 [app-region:no-drag] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/60",
                active === id
                  ? "bg-selected text-foreground hover:bg-selected before:pointer-events-none before:absolute before:-left-[5px] before:h-4 before:w-0.5 before:rounded-full before:bg-current"
                  : "text-remote-foreground-muted",
              )}
              aria-label={text}
              aria-pressed={active === id}
              data-testid={
                id === "automations"
                  ? "automations-open"
                  : id === "plugin-store"
                    ? "plugin-store-sidebar-open"
                    : id === "settings"
                      ? TID_TASK_SETTINGS_BUTTON
                      : `workspace-primary-${id}`
              }
              onClick={() => onSelect(id)}
            >
              <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
            </Button>
          </ControlHintTooltip>
        );
        return id === "settings" ? (
          <div key={id} className="mt-auto flex flex-col items-center gap-1">
            {isDesktop ? <WorkspaceBotChannelsTrigger /> : null}
            {button}
          </div>
        ) : (
          button
        );
      })}
    </nav>
  );
}
