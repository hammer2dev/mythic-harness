import { Clock3, Moon } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { Spinner } from "@/components/ui/spinner.js";
import type { AutomationsNavigationTab } from "@/lib/taskNavigationHistory.js";

type AutomationTaskNavigationTab = Exclude<AutomationsNavigationTab, "workflow">;

interface AutomationsSecondaryNavigationProps {
  title: string;
  tabs: readonly { id: AutomationTaskNavigationTab; label: string }[];
  activeTab: AutomationTaskNavigationTab;
  onTabChange: (tab: AutomationTaskNavigationTab) => void;
  onTaskSelect: (id: string) => void;
  taskList: {
    items: readonly { id: string; title: string }[];
    selectedId: string | null;
    loading: boolean;
    error: string | null;
    emptyLabel: string;
  } | null;
}

const TAB_ICONS = { scheduled: Clock3, idle: Moon };

export function resolveAutomationTemplateVisibility({
  hasAnyTasks,
  offPeakCreationEnabled,
  tab,
  hasSecondaryNavigation = false,
}: {
  hasAnyTasks: boolean;
  offPeakCreationEnabled: boolean;
  tab: "scheduled" | "idle";
  hasSecondaryNavigation?: boolean;
}): { showOffPeakTemplates: boolean; showScheduledTemplates: boolean } {
  // 旧空首页没有分类入口，需要并列两类模板；二级栏提供分类后必须跟随当前选择，
  // 否则「闲时任务」正文仍会露出定时模板，造成导航与内容不一致。
  const showAllTemplates = !hasAnyTasks && !hasSecondaryNavigation;
  return {
    showOffPeakTemplates: offPeakCreationEnabled && (showAllTemplates || tab === "idle"),
    showScheduledTemplates: showAllTemplates || tab === "scheduled",
  };
}

/** 页面状态的只读投影；所有选择和任务操作仍交给 AutomationsSection。 */
export function AutomationsSecondaryNavigation({
  title,
  tabs,
  activeTab,
  onTabChange,
  onTaskSelect,
  taskList,
}: AutomationsSecondaryNavigationProps) {
  return (
    <nav aria-label={title} className="flex min-h-0 flex-1 flex-col px-2 py-3">
      <h2 className="px-2 pb-2 text-ui-lg font-semibold text-foreground">{title}</h2>
      <div className="flex shrink-0 flex-col gap-1">
        {tabs.map(({ id, label }) => {
          const Icon = TAB_ICONS[id];
          return (
            <Button
              key={id}
              type="button"
              variant="ghost"
              aria-pressed={activeTab === id}
              data-automation-navigation-tab={id}
              className={cn(
                "h-8 w-full justify-start gap-2 px-2 focus-visible:ring-2 focus-visible:ring-input-border-focused",
                activeTab === id ? "bg-selected text-foreground" : "text-foreground-subtle",
              )}
              onClick={() => onTabChange(id)}
            >
              <Icon className="size-4" aria-hidden="true" />
              <span className="truncate">{label}</span>
            </Button>
          );
        })}
      </div>
      {taskList ? (
        <div
          data-automation-navigation-tasks
          aria-busy={taskList.loading}
          className="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-border pt-3"
        >
          {taskList.error ? (
            <p role="alert" className="px-2 pb-2 text-ui-sm text-destructive">
              {taskList.error}
            </p>
          ) : null}
          {taskList.loading ? (
            <div className="flex justify-center py-3">
              <Spinner className="size-4" />
            </div>
          ) : null}
          {taskList.items.length > 0 ? (
            <div className="flex flex-col gap-1">
              {taskList.items.map((task) => (
                <Button
                  key={task.id}
                  type="button"
                  variant="ghost"
                  title={task.title}
                  aria-current={taskList.selectedId === task.id ? "page" : undefined}
                  data-automation-navigation-task={task.id}
                  className={cn(
                    "h-8 w-full justify-start px-2 focus-visible:ring-2 focus-visible:ring-input-border-focused",
                    taskList.selectedId === task.id
                      ? "bg-selected text-foreground"
                      : "text-foreground-subtle",
                  )}
                  onClick={() => onTaskSelect(task.id)}
                >
                  <span className="truncate">{task.title}</span>
                </Button>
              ))}
            </div>
          ) : !taskList.loading && !taskList.error ? (
            <p className="px-2 py-2 text-ui-sm text-foreground-subtlest">{taskList.emptyLabel}</p>
          ) : null}
        </div>
      ) : null}
    </nav>
  );
}
