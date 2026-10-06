import { BarChart3, Package } from "lucide-react";
import { useMemo } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { ServiceProvider } from "@/hooks/useServices.js";
import { useBaseWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { resolveModelProviderConnectivityWorkspacePath } from "@/lib/modelProviderConnectivityTarget.js";
import { resolveProjectNavigationTarget } from "@/lib/projectNavigationTarget.js";
import type { ModelGatewayOpenTarget } from "@/lib/modelGatewayNavigation.js";
import { ModelProviderSection } from "@/settings/ModelProviderSection.js";
import { SettingsBreadcrumbReporter } from "@/settings/SettingsHeaderBreadcrumb.js";
import { SETTINGS_FRAME_CONTENT_CLASSNAME } from "@/settings/SettingsPageParts.js";
import { UsageStatsSection } from "@/settings/UsageStatsSection.js";
import { useTabStore } from "@/store/TabStoreProvider.js";
import { isWorkspaceTab } from "@/store/tabStore.js";

const MODEL_GATEWAY_SECTIONS = [
  { id: "modelProvider", icon: Package, titleId: "settings.modelProviderTitle" },
  { id: "usage", icon: BarChart3, titleId: "settings.usageTitle" },
] as const;

interface ModelGatewayPageProps {
  target: ModelGatewayOpenTarget;
  onNavigate: (target: ModelGatewayOpenTarget) => void;
  onConsumeProviderTarget: () => void;
  navigationContainer?: HTMLElement | null;
  onNavigationSelect?: () => void;
  workspacePath: string;
  workspaceIdentity?: string;
  workspaceRemoteSessionId?: string;
}

export function ModelGatewayPage({
  target,
  onNavigate,
  onConsumeProviderTarget,
  navigationContainer,
  onNavigationSelect,
  workspacePath,
  workspaceIdentity,
  workspaceRemoteSessionId,
}: ModelGatewayPageProps) {
  const { intl } = useZCodeIntl();
  const localHostServices = useBaseWorkspaceServices();
  const tabs = useTabStore((state) => state.tabs);
  const activeTabId = useTabStore((state) => state.activeTabId);
  const workspaceTabs = useMemo(() => tabs.filter(isWorkspaceTab), [tabs]);
  // 任务 cwd 可能属于项目非主目录；按项目 scope 找 tab 才能保留远端的本地测试路径。
  const activeWorkspaceTab = useMemo(
    () =>
      resolveProjectNavigationTarget({ tabs, activeTabId }, { workspacePath, workspaceIdentity })
        ?.tab ?? null,
    [activeTabId, tabs, workspaceIdentity, workspacePath],
  );
  const connectivityWorkspacePath = useMemo(
    () =>
      resolveModelProviderConnectivityWorkspacePath({
        activeWorkspacePath: workspacePath,
        activeWorkspaceIdentity: workspaceIdentity,
        activeWorkspaceTab,
        workspaceTabs,
      }),
    [activeWorkspaceTab, workspaceIdentity, workspacePath, workspaceTabs],
  );
  const isRemoteWorkspace = Boolean(
    workspaceIdentity?.trim() ||
    workspaceRemoteSessionId?.trim() ||
    activeWorkspaceTab?.remoteSessionId?.trim() ||
    activeWorkspaceTab?.remoteTarget,
  );
  const sectionTitle = intl.formatMessage({
    id: target.section === "modelProvider" ? "settings.modelProviderTitle" : "settings.usageTitle",
  });
  const navigation = (
    <nav
      aria-label={intl.formatMessage({ id: "workspaceNavigation.modelGateway" })}
      data-testid="model-gateway-navigation"
      className="flex min-h-0 flex-1 flex-col px-2 py-3"
    >
      <h2 className="px-2 pb-2 text-ui-lg font-semibold">
        {intl.formatMessage({ id: "workspaceNavigation.modelGateway" })}
      </h2>
      <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto">
        {MODEL_GATEWAY_SECTIONS.map(({ id, icon: Icon, titleId }) => (
          <Button
            key={id}
            type="button"
            variant="ghost"
            data-testid={`model-gateway-section-${id}`}
            aria-current={target.section === id ? "page" : undefined}
            className={cn(
              "w-full justify-start gap-2 text-ui-base font-normal",
              target.section === id ? "bg-selected text-foreground" : "text-foreground-subtle",
            )}
            onClick={() => {
              onNavigate({ section: id });
              onNavigationSelect?.();
            }}
          >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            {intl.formatMessage({ id: titleId })}
          </Button>
        ))}
      </div>
    </nav>
  );

  return (
    <>
      {navigationContainer !== undefined
        ? navigationContainer
          ? createPortal(navigation, navigationContainer)
          : null
        : navigation}
      <div
        className="min-h-0 flex-1 overflow-y-auto"
        data-testid="model-gateway-page"
        data-active-section={target.section}
      >
        <SettingsBreadcrumbReporter items={[{ label: sectionTitle }]} />
        <div className={cn(SETTINGS_FRAME_CONTENT_CLASSNAME, "space-y-6 pt-4")}>
          <h1 className="text-ui-xl font-semibold tracking-tight">{sectionTitle}</h1>
          {target.section === "modelProvider" ? (
            <ServiceProvider services={localHostServices}>
              {/* 模型配置沿用根 Host；远端工作区路径不能交给本机连通性测试。 */}
              <ModelProviderSection
                workspacePath={workspacePath}
                connectivityWorkspacePath={connectivityWorkspacePath}
                connectivityWorkspaceRequired={isRemoteWorkspace}
                pendingModelProviderTarget={
                  target.providerId ? { providerId: target.providerId } : undefined
                }
                onConsumePendingModelProviderTarget={onConsumeProviderTarget}
              />
            </ServiceProvider>
          ) : (
            <>
              <p
                className="text-ui-base text-foreground-subtle"
                data-testid="model-gateway-usage-scope"
                data-host-scope={isRemoteWorkspace ? "remote" : "local"}
              >
                {intl.formatMessage({
                  id: isRemoteWorkspace
                    ? "modelGateway.usageScope.remote"
                    : "modelGateway.usageScope.local",
                })}
              </p>
              <UsageStatsSection />
            </>
          )}
        </div>
      </div>
    </>
  );
}
