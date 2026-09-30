import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Plus } from "lucide-react";
import {
  TID_WORKFLOWS_CREATE_VIA_CHAT,
  TID_WORKFLOWS_EMPTY,
  TID_WORKFLOWS_REFRESH,
  resolveWorkspaceKey,
} from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { Spinner } from "@/components/ui/spinner.js";
import { cn } from "@/components/lib/utils.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useTabStore } from "@/store/TabStoreProvider.js";
import {
  buildAutomationWorkspaceOptions,
  type AutomationWorkspaceOption,
} from "@/settings/automationWorkspaceOptions.js";
import { AutomationRefreshIcon } from "@/settings/AutomationDesignPrimitives.js";
import { SETTINGS_FRAME_CONTENT_CLASSNAME } from "@/settings/SettingsPageParts.js";
import { buildSavedWorkflowCreatePrompt } from "@/settings/saved-workflows/savedWorkflowLaunchPrompt.js";
import { SavedWorkflowProjectGroup } from "@/settings/saved-workflows/SavedWorkflowProjectGroup.js";
import { SavedWorkflowGlobalGroup } from "@/settings/saved-workflows/SavedWorkflowGlobalGroup.js";
import type { SavedWorkflowLaunchTarget } from "@/settings/saved-workflows/useSavedWorkflowLauncher.js";
import { SavedWorkflowsSecondaryNavigation } from "@/settings/saved-workflows/SavedWorkflowsSecondaryNavigation.js";
import {
  resolveSavedWorkflowGroupMode,
  type SavedWorkflowsSelection,
} from "@/settings/saved-workflows/savedWorkflowNavigation.js";
import type {
  SavedWorkflowGroupState,
  SavedWorkflowProjectTarget,
  SavedWorkflowsOpenArtifactParams,
  SavedWorkflowsOpenRunParams,
} from "@/settings/saved-workflows/savedWorkflowContract.js";

export type {
  SavedWorkflowProjectTarget,
  SavedWorkflowsOpenArtifactParams,
  SavedWorkflowsOpenRunParams,
  SavedWorkflowLaunchTarget,
};

/** 深链目标：默认 project（缺 scope 兼容旧调用），或 global（无 workspaceKey）。 */
export type SavedWorkflowsOpenTarget =
  | { scope?: "project"; workspaceKey: string; name: string }
  | { scope: "global"; name: string };

interface SavedWorkflowsSectionProps {
  /** undefined 使用页面内布局；null 表示外部二级目录插槽尚未挂载。 */
  navigationContainer?: HTMLElement | null;
  /** 概览页的标题与说明；详情页保留独立标题。 */
  header?: ReactNode;
  /** 活动 workspace：只用来打「当前」标记和作全局空态的创建目标。 */
  workspacePath?: string | null;
  workspaceIdentity?: string;
  /** 「运行」= GUI 直接启动：accepted 后切到新会话。 */
  onNavigateToLaunchedRun?: (target: SavedWorkflowLaunchTarget, sessionId: string) => void;
  /** 「通过对话创建」/「在对话里修订」：只预填草稿，不发送；target = 所属项目（空态卡取活动项目）。 */
  onCreateViaChat?: (prompt: string, target: SavedWorkflowProjectTarget) => void;
  /** 运行历史「查看实例」：切到发起它的会话并打开实例详情页。 */
  onOpenWorkflowRun?: (params: SavedWorkflowsOpenRunParams) => void;
  /** 产物 chip → `workflow-artifact` tab。 */
  onOpenWorkflowArtifact?: (params: SavedWorkflowsOpenArtifactParams) => void;
  /** 深链直接落到详情页；定位后由调用方清空。project 需 workspaceKey，global 只需 name。 */
  openWorkflow?: SavedWorkflowsOpenTarget | null;
  onOpenWorkflowConsumed?: () => void;
}

/** 全局组的 readiness 用固定键 `"global"`，与项目组的 workspaceKey 同存一张表。 */
const GLOBAL_READINESS_KEY = "global";

function resolveOptionKey(option: AutomationWorkspaceOption): string {
  return resolveWorkspaceKey({
    workspacePath: option.workspacePath,
    ...(option.workspaceIdentity ? { workspaceIdentity: option.workspaceIdentity } : {}),
  });
}

/**
 * 已保存工作流中枢：顶部固定「全局」组，
 * 其下按已打开项目分组。页只持有刷新计数器、每组的加载态、详情态；「项目」= `buildAutomationWorkspaceOptions`。
 */
export function SavedWorkflowsSection({
  navigationContainer,
  header,
  workspacePath,
  workspaceIdentity,
  onNavigateToLaunchedRun,
  onCreateViaChat,
  onOpenWorkflowRun,
  onOpenWorkflowArtifact,
  openWorkflow,
  onOpenWorkflowConsumed,
}: SavedWorkflowsSectionProps) {
  const { intl, locale } = useZCodeIntl();
  const tabs = useTabStore((store) => store.tabs);
  const projects = useMemo(() => buildAutomationWorkspaceOptions(tabs), [tabs]);
  // 全局组的运行 / 移动落点只能是本机项目：过滤掉远程 workspace。
  const localProjects = useMemo(
    () => projects.filter((project) => !project.remoteSessionId),
    [projects],
  );

  const [view, setView] = useState<SavedWorkflowsSelection>({ mode: "list" });
  const [refreshSeq, setRefreshSeq] = useState(0);
  const [readiness, setReadiness] = useState<Record<string, SavedWorkflowGroupState>>({});

  // 活动 workspace（由调用方以 prop 传入）：打「当前」标记、全局组默认落点与全局空态的创建目标。
  const activeKey = useMemo(
    () =>
      workspacePath
        ? resolveWorkspaceKey({
            workspacePath,
            ...(workspaceIdentity ? { workspaceIdentity } : {}),
          })
        : null,
    [workspaceIdentity, workspacePath],
  );

  const handleStateChange = useCallback((key: string, next: SavedWorkflowGroupState) => {
    setReadiness((current) => {
      const prev = current[key];
      if (
        prev &&
        prev.loaded === next.loaded &&
        prev.empty === next.empty &&
        prev.count === next.count &&
        prev.available === next.available
      ) {
        return current;
      }
      return { ...current, [key]: next };
    });
  }, []);

  // 全局组「移到项目…」搬走一份文件后两组都要重拉。项目组没有会改动两组内容的动作（「提升为全局」
  // 只是开会话，全局档由模型另存，靠全局组的目录监听自然出现），所以只有全局组回调它。
  const handleMoved = useCallback(() => setRefreshSeq((seq) => seq + 1), []);

  // 深链：把 openWorkflow 落到对应详情页，然后消费。project 不在候选里就只消费不跳转。
  const consumedRef = useRef<SavedWorkflowsOpenTarget | null>(null);
  useEffect(() => {
    if (!openWorkflow) {
      consumedRef.current = null;
      return;
    }
    if (consumedRef.current === openWorkflow) return;
    consumedRef.current = openWorkflow;
    if (openWorkflow.scope === "global") {
      setView({ mode: "detail", scope: "global", name: openWorkflow.name });
    } else if (
      projects.some((project) => resolveOptionKey(project) === openWorkflow.workspaceKey)
    ) {
      setView({
        mode: "detail",
        scope: "project",
        workspaceKey: openWorkflow.workspaceKey,
        name: openWorkflow.name,
      });
    }
    onOpenWorkflowConsumed?.();
  }, [onOpenWorkflowConsumed, openWorkflow, projects]);

  // 项目详情打开后项目被关闭：回退到列表（用 effect，不在渲染里 setState）。
  useEffect(() => {
    if (
      view.mode === "detail" &&
      view.scope === "project" &&
      !projects.some((project) => resolveOptionKey(project) === view.workspaceKey)
    ) {
      setView({ mode: "list" });
    }
  }, [projects, view]);

  // 全局空态卡的创建目标：活动项目，活动项目不在候选里则第一个候选（项目档创建）。
  const emptyCardTarget = useMemo<SavedWorkflowProjectTarget | null>(() => {
    const active = projects.find((project) => resolveOptionKey(project) === activeKey);
    const target = active ?? projects[0];
    if (!target) return null;
    return {
      workspacePath: target.workspacePath,
      ...(target.workspaceIdentity ? { workspaceIdentity: target.workspaceIdentity } : {}),
    };
  }, [activeKey, projects]);

  const handleCreateFromEmpty = useCallback(() => {
    if (!emptyCardTarget) return;
    onCreateViaChat?.(buildSavedWorkflowCreatePrompt(locale), emptyCardTarget);
  }, [emptyCardTarget, locale, onCreateViaChat]);

  const globalGroupCommonProps = {
    refreshSeq,
    onStateChange: handleStateChange,
    onNavigateToLaunchedRun,
    onCreateViaChat,
    onOpenWorkflowRun,
    onOpenWorkflowArtifact,
    localProjects,
    activeProjectKey: activeKey,
    onMoved: handleMoved,
  };

  const globalReady = readiness[GLOBAL_READINESS_KEY];
  const anyLoaded =
    Boolean(globalReady?.loaded) ||
    projects.some((project) => readiness[resolveOptionKey(project)]?.loaded);
  // 全局空态卡只看项目组：所有项目组都加载且空时出现，忽略全局组的空/满。
  const allProjectsLoaded =
    projects.length > 0 &&
    projects.every((project) => {
      const state = readiness[resolveOptionKey(project)];
      return state?.loaded && state.available;
    });
  const allProjectsEmpty =
    allProjectsLoaded && projects.every((project) => readiness[resolveOptionKey(project)]?.empty);
  // 标题旁的总数 = 各已加载组（含全局组）的合法工作流条数之和。
  const totalCount = projects.reduce(
    (sum, project) => {
      const entry = readiness[resolveOptionKey(project)];
      return sum + (entry?.loaded ? entry.count : 0);
    },
    globalReady?.loaded ? globalReady.count : 0,
  );

  const navigation = navigationContainer
    ? createPortal(
        <SavedWorkflowsSecondaryNavigation
          projects={projects}
          readiness={readiness}
          selection={view}
          onSelect={setView}
        />,
        navigationContainer,
      )
    : null;

  return (
    <>
      {navigation}
      <div
        data-workflows-content
        className={cn("flex flex-col", view.mode === "list" && SETTINGS_FRAME_CONTENT_CLASSNAME)}
      >
        {view.mode === "list" ? header : null}

        {view.mode === "list" ? (
          <div className="mt-8 flex items-center justify-between">
            <h2 className="text-ui-base font-medium leading-5 text-foreground-subtle">
              {intl.formatMessage({ id: "workflows.hub.sectionTitle" })}
              {totalCount > 0 ? (
                <span className="ml-1 font-normal text-foreground-subtlest">{totalCount}</span>
              ) : null}
            </h2>
            <ControlHintTooltip title={intl.formatMessage({ id: "workflows.hub.refresh" })}>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={intl.formatMessage({ id: "workflows.hub.refresh" })}
                data-testid={TID_WORKFLOWS_REFRESH}
                onClick={() => setRefreshSeq((seq) => seq + 1)}
              >
                <AutomationRefreshIcon className="size-3.5" aria-hidden="true" />
              </Button>
            </ControlHintTooltip>
          </div>
        ) : null}

        {view.mode === "list" && !anyLoaded ? (
          <div className="mt-8 flex h-40 items-center justify-center">
            <Spinner className="size-5" />
          </div>
        ) : null}

        {/* 组始终挂载才能各自加载并回报状态（未就绪 / 空项目组内部渲染 null；全局组空也显示）；
         首屏 spinner 只是覆盖在上，不阻断加载。全局组恒置顶，项目组在其下。 */}
        <div
          className={cn("flex flex-col", view.mode === "list" && (anyLoaded ? "mt-5" : "hidden"))}
        >
          <SavedWorkflowGlobalGroup
            {...globalGroupCommonProps}
            mode={resolveSavedWorkflowGroupMode(view, "global")}
            onOpenDetail={(name) => setView({ mode: "detail", scope: "global", name })}
            onBack={() => setView({ mode: "list" })}
          />

          {view.mode !== "list" ? null : projects.length === 0 ? (
            <p className="mt-8 text-ui-base text-foreground-subtlest">
              {intl.formatMessage({ id: "workflows.hub.noWorkspace" })}
            </p>
          ) : allProjectsEmpty ? (
            <div
              data-testid={TID_WORKFLOWS_EMPTY}
              className="mt-8 flex h-[226px] w-full items-center justify-center rounded-2xl border border-card-border bg-background px-4"
            >
              <div className="flex translate-y-2 flex-col items-center gap-5">
                <div className="flex flex-col items-center gap-1.5 text-center">
                  <p className="text-ui-base font-medium leading-5 text-foreground-subtlest">
                    {intl.formatMessage({ id: "workflows.hub.empty.title" })}
                  </p>
                  <p className="max-w-[420px] text-ui-base leading-5 text-foreground-subtlest">
                    {intl.formatMessage({ id: "workflows.hub.empty.hint" })}
                  </p>
                </div>
                <Button
                  type="button"
                  size="lg"
                  data-icon="inline-start"
                  data-testid={TID_WORKFLOWS_CREATE_VIA_CHAT}
                  onClick={handleCreateFromEmpty}
                >
                  <Plus className="size-4" aria-hidden="true" />
                  {intl.formatMessage({ id: "workflows.hub.createViaChat" })}
                </Button>
              </div>
            </div>
          ) : null}

          {projects.map((project) => {
            const workspaceKey = resolveOptionKey(project);
            return (
              <SavedWorkflowProjectGroup
                key={workspaceKey}
                project={project}
                isCurrent={activeKey === workspaceKey}
                refreshSeq={refreshSeq}
                mode={resolveSavedWorkflowGroupMode(view, "project", workspaceKey)}
                onStateChange={handleStateChange}
                onOpenDetail={(name) =>
                  setView({ mode: "detail", scope: "project", workspaceKey, name })
                }
                onBack={() => setView({ mode: "list" })}
                onNavigateToLaunchedRun={onNavigateToLaunchedRun}
                onCreateViaChat={onCreateViaChat}
                onOpenWorkflowRun={onOpenWorkflowRun}
                onOpenWorkflowArtifact={onOpenWorkflowArtifact}
              />
            );
          })}
        </div>
      </div>
    </>
  );
}
