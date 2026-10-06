import { memo, type Ref } from "react";
import { CalendarClock, Cpu, Folder, GitBranch, Puzzle } from "lucide-react";
import { TID_AUTOMATIONS_OPEN } from "@zcode/shared";
import type { WorkspaceMainView } from "@/app-shell/types.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useDynamicWorkflowAvailability } from "@/hooks/useDynamicWorkflowAvailability.js";

export const WORKSPACE_NAVIGATION_RAIL_WIDTH_PX = 56;

export const WorkspacePrimaryNavigation = memo(function WorkspacePrimaryNavigation({
  activeView,
  onSelect,
  appLogoUrl,
  hideLogo,
  footerRef,
}: {
  activeView: WorkspaceMainView | "settings";
  onSelect: (view: WorkspaceMainView) => void;
  appLogoUrl: string;
  hideLogo?: boolean;
  footerRef: Ref<HTMLDivElement>;
}) {
  const { intl } = useZCodeIntl();
  const { enabled: dynamicWorkflowEnabled } = useDynamicWorkflowAvailability();
  // 分支线、拼图和芯片以不同轮廓区分入口，避免小尺寸下方框组合图标难以辨认。
  const entries = [
    {
      view: "chat",
      label: "workspaceSidebar.projectsSection",
      icon: Folder,
      testId: "workspace-primary-projects",
    },
    {
      view: "automations",
      label: "workspaceNavigation.scheduledTasks",
      icon: CalendarClock,
      testId: TID_AUTOMATIONS_OPEN,
    },
    {
      view: "workflows",
      label: "workspaceNavigation.workflows",
      icon: GitBranch,
      testId: "workspace-primary-workflows",
    },
    {
      view: "plugin-store",
      label: "workspace.openPluginsSettings",
      icon: Puzzle,
      testId: "plugin-store-sidebar-open",
    },
    {
      view: "model-gateway",
      label: "workspaceNavigation.modelGateway",
      icon: Cpu,
      testId: "workspace-primary-model-gateway",
    },
  ] as const;

  return (
    <nav
      aria-label={intl.formatMessage({ id: "workspaceNavigation.label" })}
      data-testid="workspace-primary-navigation"
      className="relative z-20 flex h-full w-14 shrink-0 flex-col items-center border-r border-border/50 bg-sidebar"
    >
      <div className="flex h-14 w-full shrink-0 items-center justify-center [app-region:drag]">
        {hideLogo ? null : (
          <img src={appLogoUrl} alt="ZCode" className="size-6" draggable={false} />
        )}
      </div>
      <div className="flex flex-col items-center gap-2 py-2 [app-region:no-drag]">
        {entries
          .filter(({ view }) => view !== "workflows" || dynamicWorkflowEnabled)
          .map(({ view, label, icon: Icon, testId }) => {
            const title = intl.formatMessage({ id: label });
            return (
              <ControlHintTooltip key={view} title={title} side="right">
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label={title}
                  aria-pressed={activeView === view}
                  data-testid={testId}
                  onClick={() => onSelect(view)}
                  className={cn(
                    "text-foreground-subtle hover:bg-surface-hover hover:text-foreground",
                    activeView === view && "bg-selected text-foreground",
                  )}
                >
                  <Icon className="size-5" />
                </Button>
              </ControlHintTooltip>
            );
          })}
      </div>
      <div ref={footerRef} className="mt-auto w-full [app-region:no-drag]" />
    </nav>
  );
});
