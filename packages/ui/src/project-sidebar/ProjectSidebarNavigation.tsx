import { memo } from "react";
import { cn } from "@/components/lib/utils.js";
import { WORKSPACE_PAGE_TOP_PADDING_CLASSNAME } from "@/settings/SettingsPageParts.js";
import type { ProjectSidebarProps } from "@/project-sidebar/contract.js";
import { NewTaskButtonGroup } from "@/NewTaskButtonGroup.js";
import { WebRemoteControlDeviceHeader } from "@/web-remote-control/WebRemoteControlDeviceHeader.js";
import { NavPrimarySlot } from "@/extension-slots/index.js";
import { WorkspaceSecondaryNavigationTitle } from "./WorkspacePrimaryNavigation.js";

/** 顶部导航只展示 Shell 的选中状态，路由仍由 Shell 唯一持有。 */
// 展开偏好会更新侧栏父组件；导航按原 props 和稳定命令隔离，避免无关菜单跟随渲染。
export const ProjectSidebarNavigation = memo(function ProjectSidebarNavigation({
  props,
  onCreate,
}: {
  props: Pick<
    ProjectSidebarProps,
    | "isWebRemoteControl"
    | "onOpenAutomations"
    | "automationsActive"
    | "onOpenPluginStore"
    | "pluginStoreActive"
    | "webRemoteControlWorkspaceSwitcher"
    | "navPrimarySlot"
    | "workspacePath"
    | "workspaceIdentity"
    | "workspaceRemoteSessionId"
  >;
  onCreate(): void;
}) {
  const deviceNavigation = props.webRemoteControlWorkspaceSwitcher?.deviceNavigation;
  return (
    <div
      data-testid="sidebar-primary-navigation"
      className={cn(
        "flex flex-col gap-1 px-2 pb-3",
        props.isWebRemoteControl ? "pt-3" : WORKSPACE_PAGE_TOP_PADDING_CLASSNAME,
        props.isWebRemoteControl && !deviceNavigation && "max-md:pt-11",
      )}
    >
      {/* Relay V2 远控：当前电脑是项目与任务的上一级，放在导航首行；手机端占用原顶部留白。 */}
      {deviceNavigation ? <WebRemoteControlDeviceHeader navigation={deviceNavigation} /> : null}
      {!props.isWebRemoteControl ? (
        <WorkspaceSecondaryNavigationTitle active="chat" className="px-2.5 pb-1" />
      ) : null}
      <NewTaskButtonGroup onCreateTask={onCreate} />
      {/* 扩展导航条目（nav.primary）：手机远控与「插件市场」一同隐藏；逻辑都在 extension-slots。 */}
      {!props.isWebRemoteControl && props.navPrimarySlot ? (
        <NavPrimarySlot
          workspacePath={props.workspacePath}
          {...(props.workspaceIdentity ? { workspaceIdentity: props.workspaceIdentity } : {})}
          {...(props.workspaceRemoteSessionId
            ? { workspaceRemoteSessionId: props.workspaceRemoteSessionId }
            : {})}
          {...props.navPrimarySlot}
        />
      ) : null}
    </div>
  );
});
