import { useCallback, useState } from "react";
import { createPortal } from "react-dom";
import type { CreateTaskRequest } from "@/app-shell/types.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  consumePluginStoreOpenTarget,
  type PluginStoreOpenTarget,
} from "@/lib/pluginStoreNavigation.js";
import { PluginStoreBrowsePage } from "@/settings/PluginStoreBrowsePage.js";
import { PluginStoreNavigation } from "@/settings/PluginStoreNavigation.js";
import type { PluginStoreSegment } from "@/settings/PluginStoreListView.js";
import { PluginsSection } from "@/settings/PluginsSection.js";
import {
  SettingsBreadcrumbProvider,
  SettingsBreadcrumbReporter,
  type SettingsBreadcrumbItem,
} from "@/settings/SettingsHeaderBreadcrumb.js";

type ManagementPage = "installed" | "mcp" | "skill";
type StoreLocation =
  | {
      page: "browse";
      segment: PluginStoreSegment;
      target?: PluginStoreOpenTarget;
      sourcesOpen?: boolean;
    }
  | { page: ManagementPage; scopeKey?: string };

interface PluginStorePageProps {
  workspacePath?: string | null;
  workspaceIdentity?: string;
  onCreateTask?: (request?: CreateTaskRequest) => void;
  navigationContainer?: HTMLElement | null;
}

export function PluginStorePage({
  workspacePath,
  workspaceIdentity,
  onCreateTask,
  navigationContainer,
}: PluginStorePageProps) {
  const [location, setLocation] = useState<StoreLocation>(() => {
    const target = consumePluginStoreOpenTarget();
    return target?.page && target.page !== "browse"
      ? { page: target.page, scopeKey: target.scopeKey }
      : { page: "browse", segment: "public", target: target ?? undefined };
  });
  const selectManagement = useCallback((page: ManagementPage) => {
    setLocation((current) => (current.page === page ? current : { page }));
  }, []);
  const openBrowse = useCallback(
    (segment: PluginStoreSegment = "public", intent?: "add-marketplace") => {
      setLocation({ page: "browse", segment, target: intent ? { intent } : undefined });
    },
    [],
  );

  // 浏览固定读取 User inventory；管理可选择其他项目。互斥挂载避免两条初始化路径争抢同一 Store。
  if (location.page === "browse") {
    return (
      <PluginStoreBrowsePage
        workspacePath={workspacePath}
        workspaceIdentity={workspaceIdentity}
        onCreateTask={onCreateTask}
        navigationContainer={navigationContainer}
        initialTarget={location.target}
        initialSegment={location.segment}
        initialSourcesOpen={location.sourcesOpen}
        onSelectManagement={selectManagement}
      />
    );
  }

  const navigation = (
    <PluginStoreNavigation
      page={location.page}
      onSelectSegment={openBrowse}
      onSelectManagement={selectManagement}
      onOpenSources={() => setLocation({ page: "browse", segment: "personal", sourcesOpen: true })}
    />
  );
  return (
    <>
      {navigationContainer !== undefined
        ? navigationContainer
          ? createPortal(navigation, navigationContainer)
          : null
        : navigation}
      <PluginStoreManagementPage
        key={location.page}
        page={location.page}
        scopeKey={location.scopeKey}
        workspacePath={workspacePath}
        workspaceIdentity={workspaceIdentity}
        onCreateTask={onCreateTask}
        onOpenBrowse={openBrowse}
      />
    </>
  );
}

function PluginStoreManagementPage({
  page,
  scopeKey,
  workspacePath,
  workspaceIdentity,
  onCreateTask,
  onOpenBrowse,
}: PluginStorePageProps & {
  page: ManagementPage;
  scopeKey?: string;
  onOpenBrowse: (segment?: PluginStoreSegment, intent?: "add-marketplace") => void;
}) {
  const { intl } = useZCodeIntl();
  const [breadcrumbs, setBreadcrumbs] = useState<readonly SettingsBreadcrumbItem[]>([]);
  const title = intl.formatMessage({
    id:
      page === "installed"
        ? "settings.plugins.store.installedPage"
        : page === "mcp"
          ? "settings.mcpTitle"
          : "settings.skills.title",
  });
  const openBrowse = useCallback(() => onOpenBrowse(), [onOpenBrowse]);
  return (
    <div className="space-y-5" data-testid="plugin-store-management" data-page={page}>
      <SettingsBreadcrumbReporter
        items={breadcrumbs.length ? breadcrumbs : [{ label: title }]}
        onSectionSelect={openBrowse}
      />
      {breadcrumbs.length < 2 ? (
        <header className="space-y-2">
          <h1 className="text-ui-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-ui-base text-foreground-subtle">
            {intl.formatMessage({ id: `settings.plugins.store.${page}Description` })}
          </p>
        </header>
      ) : null}
      <SettingsBreadcrumbProvider sectionLabel={title} onItemsChange={setBreadcrumbs}>
        <PluginsSection
          mode={page === "installed" ? "plugin" : page}
          initialScopeKey={scopeKey}
          workspacePath={workspacePath}
          workspaceIdentity={workspaceIdentity}
          onCreateTask={onCreateTask}
          onOpenPluginStore={(_scopeKey, intent) => onOpenBrowse("public", intent)}
        />
      </SettingsBreadcrumbProvider>
    </div>
  );
}
