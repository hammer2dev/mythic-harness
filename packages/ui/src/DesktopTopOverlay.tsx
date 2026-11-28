import { SidebarTooltipProvider } from "@/ControlHintTooltip.js";
import type { IPlatformService, UpdateStatePayload } from "@zcode/shared";
import { cn } from "@/components/lib/utils.js";
import { ArrowLeftIcon, ArrowRightIcon, MessageCirclePlus } from "lucide-react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { UpdateStatusButton } from "@/UpdateStatusButton.js";
import { DesktopTopOverlayActionButton } from "@/DesktopTopOverlayActionButton.js";
import {
  createWindowsCaptionControlsStyle,
  WINDOWS_CAPTION_CONTROLS_RIGHT_INSET_VAR,
} from "@/windowCaptionControls.js";

interface DesktopTopOverlayProps {
  workspaceAbsPath: string;
  isMacDesktop?: boolean;
  isMacFullscreen?: boolean;
  isWindowsDesktop?: boolean;
  isDesktop?: boolean;
  macWindowControlsLeftPaddingPx: number;
  windowsWindowControlsRightPaddingPx?: number;
  primaryNavigationWidthPx: number;
  isSidebarVisible: boolean;
  updateReadyVersion: string | null;
  updateState: UpdateStatePayload | null;
  newTaskShortcutLabel: string;
  goBackShortcutLabel: string;
  goForwardShortcutLabel: string;
  canTaskNavBack: boolean;
  canTaskNavForward: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  showNewTaskButton?: boolean;
  platform: IPlatformService;
  onCreateTask: () => void;
  onGoBack: () => void;
  onGoForward: () => void;
  hideTaskNavigationButtons?: boolean;
  newTaskDisabledReason?: string;
}

export function DesktopTopOverlay({
  workspaceAbsPath: _workspaceAbsPath,
  isMacDesktop,
  isMacFullscreen,
  isWindowsDesktop,
  isDesktop,
  macWindowControlsLeftPaddingPx,
  windowsWindowControlsRightPaddingPx,
  primaryNavigationWidthPx,
  isSidebarVisible,
  updateReadyVersion,
  updateState,
  newTaskShortcutLabel,
  goBackShortcutLabel,
  goForwardShortcutLabel,
  canTaskNavBack,
  canTaskNavForward,
  canGoBack: _canGoBack,
  canGoForward: _canGoForward,
  showNewTaskButton,
  platform,
  onCreateTask,
  onGoBack,
  onGoForward,
  hideTaskNavigationButtons = false,
  newTaskDisabledReason,
}: DesktopTopOverlayProps) {
  const { intl } = useZCodeIntl();
  const isLinuxDesktop = Boolean(isDesktop && !isMacDesktop && !isWindowsDesktop);
  const usesCustomCaptionArea = isWindowsDesktop || isLinuxDesktop;
  const newTaskTitle = intl.formatMessage({ id: "sidebar.newTask" });
  const taskBackTitle = intl.formatMessage({ id: "taskNav.back" });
  const taskForwardTitle = intl.formatMessage({ id: "taskNav.forward" });
  const isNewTaskButtonVisible = showNewTaskButton ?? !isSidebarVisible;
  const topOverlayLeftPx =
    isMacDesktop && !isMacFullscreen
      ? Math.max(primaryNavigationWidthPx, macWindowControlsLeftPaddingPx)
      : primaryNavigationWidthPx;
  const windowsTopOverlayPaddingStyle = isWindowsDesktop
    ? {
        ...createWindowsCaptionControlsStyle(windowsWindowControlsRightPaddingPx),
        paddingRight: WINDOWS_CAPTION_CONTROLS_RIGHT_INSET_VAR,
      }
    : undefined;

  return (
    <SidebarTooltipProvider>
      <div
        style={{
          left: topOverlayLeftPx,
          width: isSidebarVisible ? "var(--workspace-sidebar-panel-width)" : undefined,
        }}
        className={cn(
          "@container/topoverlayer pointer-events-none absolute top-0 z-20 flex h-14 w-fit",
          // 与贴边工作区的 Header 中心线对齐。
          usesCustomCaptionArea && primaryNavigationWidthPx === 0 && "mt-px",
          isWindowsDesktop ? "top-1.5" : isLinuxDesktop && "top-1",
        )}
      >
        <div
          style={windowsTopOverlayPaddingStyle}
          className={cn(
            "flex items-center",
            isMacDesktop && "h-14",
            usesCustomCaptionArea && "h-12",
            // Windows/Linux 工具组从一级导航右沿起，使用与 Header 对齐的 13px 留白。
            usesCustomCaptionArea && "pl-3 ml-px",
            isMacDesktop &&
              (isMacFullscreen ? (!isSidebarVisible ? "pl-5 pt-1" : "pl-3 pt-1") : "pt-1"),
          )}
        >
          <div
            className={cn(
              // 顶部浮层按钮虽然单个按钮打了 no-drag，但外层容器本身仍悬在窗口标题区上方。
              // Electron 在这类覆盖层上会优先按父级命中拖拽区域，导致点击被窗口拖动吞掉。
              // 这里把整块交互容器一起标成 no-drag，确保展开/收起和新建 task 都能稳定点击。
              "pointer-events-auto flex items-center gap-1 shrink-0 [app-region:no-drag]",
            )}
          >
            {/* 远程控制移动端左上角空间有限，任务前进/后退在这里会与主操作拥挤重叠。*/}
            {hideTaskNavigationButtons ? null : (
              <>
                <DesktopTopOverlayActionButton
                  title={taskBackTitle}
                  shortcut={goBackShortcutLabel}
                  ariaLabel={taskBackTitle}
                  testId="desktop-top-nav-back"
                  disabled={!canTaskNavBack}
                  onClick={onGoBack}
                >
                  <ArrowLeftIcon className="size-4" />
                </DesktopTopOverlayActionButton>
                <DesktopTopOverlayActionButton
                  title={taskForwardTitle}
                  shortcut={goForwardShortcutLabel}
                  ariaLabel={taskForwardTitle}
                  disabled={!canTaskNavForward}
                  onClick={onGoForward}
                >
                  <ArrowRightIcon className="size-4" />
                </DesktopTopOverlayActionButton>
              </>
            )}

            <div
              aria-hidden={!isNewTaskButtonVisible}
              className={cn(
                // 宽度动画会在侧栏已收敛后继续触发布局，完整视图也受影响；这里只淡入淡出。
                "inline-flex overflow-hidden transition-opacity duration-300 ease-out",
                isNewTaskButtonVisible ? "w-7 opacity-100" : "pointer-events-none w-0 opacity-0",
              )}
            >
              <DesktopTopOverlayActionButton
                title={newTaskDisabledReason ?? newTaskTitle}
                shortcut={newTaskShortcutLabel}
                ariaLabel={newTaskTitle}
                disabled={Boolean(newTaskDisabledReason)}
                onClick={onCreateTask}
              >
                <MessageCirclePlus className="size-4" />
              </DesktopTopOverlayActionButton>
            </div>

            {/* <div className="flex items-center [app-region:no-drag]"> */}
            {/* 侧栏收起后，更新按钮之前会跟着“展开态的容器宽度阈值”一起被隐藏。
                  但收起态本身已经改成把操作集中到顶部浮层里，如果这里还继续依赖侧栏宽度判断，
                  用户就会在最需要全局入口的时候反而看不到更新按钮。
                  所以展开态继续走容器查询，收起态则强制显示。 */}
            <UpdateStatusButton
              platform={platform}
              version={updateReadyVersion}
              updateState={updateState}
              isMacDesktop={isMacDesktop}
              isWindowsDesktop={isWindowsDesktop}
            />
            {/* </div> */}
          </div>
        </div>
      </div>
    </SidebarTooltipProvider>
  );
}
