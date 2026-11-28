import { PreinstalledToolsDialog } from "@/preinstalled-tools/index.js";
import { useState } from "react";
import { DesktopCommandIds } from "@zcode/shared";
import {
  TID_WORKSPACE_HELP_MENU_RESOURCE_MANAGER,
  TID_WORKSPACE_HELP_MENU_TRIGGER,
} from "@zcode/shared/test-ids";
import {
  ActivityIcon,
  CircleHelpIcon,
  CopyIcon,
  DownloadIcon,
  InfoIcon,
  RefreshCwIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge.js";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { cn } from "@/components/lib/utils.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useDesktopUpdateMenu } from "@/hooks/useDesktopUpdateMenu.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { runExportLogsAction } from "@/lib/exportLogsAction.js";
import { toast } from "@/components/ui/toast.js";

export function WorkspaceHelpMenuButton({ className }: { className?: string }) {
  const { intl } = useZCodeIntl();
  const platform = usePlatform();
  const [preinstalledToolsOpen, setPreinstalledToolsOpen] = useState(false);
  const updateMenu = useDesktopUpdateMenu(true);
  const helpMenuLabel = intl.formatMessage({ id: "workspaceHeader.help.menu" });
  const handleOpenResourceManager = () => {
    void platform.executeDesktopCommand(DesktopCommandIds.OpenResourceManager);
  };

  const handleShowAbout = () => {
    void platform.executeDesktopCommand(DesktopCommandIds.ShowAbout);
  };

  const handleCopyDeviceMid = async () => {
    try {
      const deviceMid = platform.getDeviceId();
      if (!deviceMid || typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
        throw new Error("clipboard unavailable");
      }
      await navigator.clipboard.writeText(deviceMid);
      toast(intl.formatMessage({ id: "workspaceHeader.help.deviceMidCopied" }));
    } catch {
      toast(intl.formatMessage({ id: "workspaceHeader.help.deviceMidCopyFailed" }));
    }
  };

  return (
    <>
      <DropdownMenu>
        <ControlHintTooltip title={helpMenuLabel} side="bottom">
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-md"
              // Settings 页会把帮助按钮绝对定位在 Electron 顶部拖拽区上方。
              // 只依赖外层容器 no-drag 时，真实 trigger 仍可能被标题栏 drag 区吞掉点击。
              className={cn(
                "text-foreground hover:bg-hover hover:text-foreground [app-region:no-drag]",
                className,
              )}
              aria-label={helpMenuLabel}
              data-testid={TID_WORKSPACE_HELP_MENU_TRIGGER}
            >
              <CircleHelpIcon className="size-4" />
            </Button>
          </DropdownMenuTrigger>
        </ControlHintTooltip>
        <DropdownMenuContent
          align="end"
          className="min-w-0 w-max [&_[data-slot=dropdown-menu-item]]:pr-6"
        >
          <DropdownMenuItem onSelect={() => void runExportLogsAction(platform, intl)}>
            <DownloadIcon className="size-4" />
            {intl.formatMessage({ id: "titleBar.menu.help.exportLogs" })}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleCopyDeviceMid}>
            <CopyIcon className="size-4" />
            {intl.formatMessage({ id: "workspaceHeader.help.copyDeviceMid" })}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid={TID_WORKSPACE_HELP_MENU_RESOURCE_MANAGER}
            onSelect={handleOpenResourceManager}
          >
            <ActivityIcon className="size-4" />
            {intl.formatMessage({ id: "titleBar.menu.help.resourceManager" })}
          </DropdownMenuItem>
          <DropdownMenuItem
            data-testid="workspace-help-menu-preinstalled-tools"
            onSelect={() => setPreinstalledToolsOpen(true)}
          >
            <DownloadIcon className="size-4" />
            {intl.formatMessage({ id: "preinstalledTools.title" })}
          </DropdownMenuItem>
          {updateMenu.visible ? (
            <DropdownMenuItem disabled={updateMenu.disabled} onSelect={updateMenu.checkForUpdates}>
              <RefreshCwIcon className="size-4" />
              {updateMenu.labelId === "desktopMenu.help.restartToUpdate" ? (
                <>
                  <span className="whitespace-nowrap">
                    {intl.formatMessage({ id: "desktopMenu.help.restartUpdateAction" })}
                  </span>
                  <Badge variant="secondary" className="h-4 px-1.5 py-0 bg-success/10 text-success">
                    {updateMenu.labelValues?.version}
                  </Badge>
                </>
              ) : (
                intl.formatMessage({ id: updateMenu.labelId }, updateMenu.labelValues)
              )}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem onSelect={handleShowAbout}>
            <InfoIcon className="size-4" />
            {intl.formatMessage({ id: "titleBar.menu.help.about" })}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <PreinstalledToolsDialog
        open={preinstalledToolsOpen}
        onOpenChange={setPreinstalledToolsOpen}
      />
    </>
  );
}
