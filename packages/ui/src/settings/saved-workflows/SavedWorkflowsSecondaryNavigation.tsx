import { Folder, Globe2, Library, Workflow } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { Spinner } from "@/components/ui/spinner.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  resolveAutomationWorkspaceSelectionKey,
  type AutomationWorkspaceOption,
} from "@/settings/automationWorkspaceOptions.js";
import type { SavedWorkflowGroupState } from "@/settings/saved-workflows/savedWorkflowContract.js";
import type { SavedWorkflowsSelection } from "@/settings/saved-workflows/savedWorkflowNavigation.js";
import {
  useSavedWorkflowStore,
  type SavedWorkflowWorkspaceState,
} from "@/store/savedWorkflowStore.js";

interface SavedWorkflowsSecondaryNavigationProps {
  projects: readonly AutomationWorkspaceOption[];
  readiness: Readonly<Record<string, SavedWorkflowGroupState>>;
  selection: SavedWorkflowsSelection;
  onSelect: (selection: SavedWorkflowsSelection) => void;
}

function WorkflowDirectoryGroup({
  label,
  scope,
  workspaceKey,
  state,
  available,
  selection,
  onSelect,
}: {
  label: string;
  scope: "global" | "project";
  workspaceKey: string;
  state: SavedWorkflowWorkspaceState | undefined;
  available: boolean;
  selection: SavedWorkflowsSelection;
  onSelect: SavedWorkflowsSecondaryNavigationProps["onSelect"];
}) {
  const { intl } = useZCodeIntl();
  const Icon = scope === "global" ? Globe2 : Folder;
  const selectedName =
    selection.mode === "detail" &&
    selection.scope === scope &&
    (selection.scope === "global" || selection.workspaceKey === workspaceKey)
      ? selection.name
      : null;
  const loading = available && (!state || state.loading);
  const status =
    state?.errorCode === -32602 && scope === "global"
      ? intl.formatMessage({ id: "workflows.hub.global.unsupported" })
      : !available
        ? scope === "global"
          ? `${intl.formatMessage({ id: "workflows.hub.global.noLocalRuntime" })} ${state?.error ?? ""}`.trim()
          : intl.formatMessage({ id: "workflows.navigation.unavailable" })
        : state?.error
          ? intl.formatMessage({ id: "workflows.hub.loadError" }, { error: state.error })
          : !loading && state?.invalid.length
            ? intl.formatMessage(
                {
                  id:
                    state.invalid.length === 1
                      ? "workflows.hub.invalidOne"
                      : "workflows.hub.invalid",
                },
                { count: String(state.invalid.length) },
              )
            : !loading && !state?.entries.length
              ? intl.formatMessage({ id: "workflows.navigation.empty" })
              : null;

  return (
    <section data-workflow-navigation-group={scope === "global" ? "global" : workspaceKey}>
      <h3 className="flex min-w-0 items-center gap-2 px-2 py-2 text-ui-sm font-medium text-foreground-subtle">
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate" title={label}>
          {label}
        </span>
        {loading ? <Spinner className="ml-auto size-3 shrink-0" /> : null}
      </h3>
      <div className="flex flex-col gap-1">
        {state?.entries.map((entry) => (
          <Button
            key={entry.name}
            type="button"
            variant="ghost"
            title={entry.description || entry.name}
            disabled={!available}
            aria-current={selectedName === entry.name ? "page" : undefined}
            data-workflow-navigation-entry={entry.name}
            className={cn(
              "h-8 w-full justify-start gap-2 px-2",
              selectedName === entry.name
                ? "bg-selected text-foreground"
                : "text-foreground-subtle",
            )}
            onClick={() =>
              onSelect(
                scope === "global"
                  ? { mode: "detail", scope, name: entry.name }
                  : { mode: "detail", scope, workspaceKey, name: entry.name },
              )
            }
          >
            <Workflow className="size-4 shrink-0" aria-hidden="true" />
            <span className="truncate">{entry.name}</span>
          </Button>
        ))}
        {status ? (
          <p
            role={state?.error ? "alert" : undefined}
            className={cn(
              "px-2 py-1 text-ui-sm",
              state?.error ? "text-destructive" : "text-foreground-subtlest",
            )}
          >
            {status}
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** 目录只投影原库存；查询、监听和操作由同一份 Group 实例执行。 */
export function SavedWorkflowsSecondaryNavigation({
  projects,
  readiness,
  selection,
  onSelect,
}: SavedWorkflowsSecondaryNavigationProps) {
  const { intl } = useZCodeIntl();
  const byWorkspaceKey = useSavedWorkflowStore((store) => store.byWorkspaceKey);
  const title = intl.formatMessage({ id: "workflows.navigation.title" });
  return (
    <nav
      aria-label={title}
      data-workflow-navigation
      className="flex min-h-0 flex-1 flex-col px-2 py-3"
    >
      <h2 className="px-2 pb-2 text-ui-lg font-semibold text-foreground">{title}</h2>
      <Button
        type="button"
        variant="ghost"
        aria-current={selection.mode === "list" ? "page" : undefined}
        data-workflow-navigation-overview
        className={cn(
          "h-8 w-full shrink-0 justify-start gap-2 px-2",
          selection.mode === "list" ? "bg-selected text-foreground" : "text-foreground-subtle",
        )}
        onClick={() => onSelect({ mode: "list" })}
      >
        <Library className="size-4" aria-hidden="true" />
        {intl.formatMessage({ id: "workflows.navigation.overview" })}
      </Button>
      <div className="mt-3 min-h-0 flex-1 space-y-3 overflow-y-auto">
        <WorkflowDirectoryGroup
          label={intl.formatMessage({ id: "workflows.hub.global.title" })}
          scope="global"
          workspaceKey="global"
          state={byWorkspaceKey.global}
          available={readiness.global?.available !== false}
          selection={selection}
          onSelect={onSelect}
        />
        {projects.map((project) => {
          const key = resolveAutomationWorkspaceSelectionKey(project);
          return (
            <WorkflowDirectoryGroup
              key={key}
              label={project.label}
              scope="project"
              workspaceKey={key}
              state={byWorkspaceKey[key]}
              available={readiness[key]?.available !== false}
              selection={selection}
              onSelect={onSelect}
            />
          );
        })}
        {projects.length === 0 ? (
          <p className="px-2 py-2 text-ui-sm text-foreground-subtlest">
            {intl.formatMessage({ id: "workflows.hub.noWorkspace" })}
          </p>
        ) : null}
      </div>
    </nav>
  );
}
