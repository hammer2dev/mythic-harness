import { memo } from "react";
import { TID_TASK_SETTINGS_BUTTON } from "@zcode/shared";
import { Settings } from "lucide-react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { WorkspaceWebRemoteControlTrigger } from "@/WorkspaceWebRemoteControlTrigger.js";
export const WorkspaceSidebarFooter = memo(function WorkspaceSidebarFooterComponent({
  onSettingsButtonClick,
  settingsButtonMode = "settings",
  workspacePath,
  workspaceIdentity,
  isDesktop = false,
  layout = "default",
  active = false,
  className,
}: {
  onSettingsButtonClick?: () => void;
  settingsButtonMode?: "settings" | "back";
  workspacePath?: string;
  workspaceIdentity?: string;
  isDesktop?: boolean;
  layout?: "default" | "rail";
  active?: boolean;
  className?: string;
}) {
  const { intl } = useZCodeIntl();
  const label = intl.formatMessage({
    id: settingsButtonMode === "back" ? "workspace.backToWorkspace" : "settings.title",
  });
  return (
    <footer
      className={cn(
        "flex shrink-0 items-center justify-end gap-1.5 pt-2 pb-4",
        layout === "rail" ? "flex-col px-1" : "px-4",
        className,
      )}
    >
      {isDesktop && workspacePath ? (
        <WorkspaceWebRemoteControlTrigger
          workspacePath={workspacePath}
          workspaceIdentity={workspaceIdentity}
          compact
        />
      ) : null}
      <ControlHintTooltip title={label}>
        <Button
          type="button"
          variant="ghost"
          size="icon-lg"
          data-testid={TID_TASK_SETTINGS_BUTTON}
          aria-label={label}
          aria-pressed={active}
          className={cn(active && "bg-selected text-foreground")}
          disabled={!onSettingsButtonClick}
          onClick={onSettingsButtonClick}
        >
          <Settings className="size-4" />
        </Button>
      </ControlHintTooltip>
    </footer>
  );
});
