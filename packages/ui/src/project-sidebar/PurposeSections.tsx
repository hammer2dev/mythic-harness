import type { ReactNode } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  closestCenter,
  type Modifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Plus, MessageCirclePlus, ListChevronsDownUp, ListChevronsUpDown } from "lucide-react";
import { WorkspacePurposeSection } from "@/WorkspaceSidebar/WorkspacePurposeSection.js";
import { useSidebarSectionsStore } from "@/store/sidebarSectionsStore.js";
import { SidebarSectionActions } from "@/project-sidebar/SidebarSectionActions.js";
import { Button } from "@/components/ui/button.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

// 原因：横向拖动会撑宽 overflow-y:auto 的侧栏并触发水平自动滚动；在碰撞计算前固定纵轴。
const sectionDragModifiers: Modifier[] = [({ transform }) => ({ ...transform, x: 0 })];

/** 折叠和分区顺序继续使用旧偏好；项目/任务数据始终由 Host 提供。 */
export function PurposeSections({
  projects,
  tasks,
  onAdd,
  onCreate,
  hasExpandedProjects,
  canToggleProjects,
  onToggleProjects,
}: {
  projects(sectionId: string): ReactNode;
  tasks: ReactNode;
  onAdd(): void;
  onCreate(): void;
  hasExpandedProjects: boolean;
  canToggleProjects: boolean;
  onToggleProjects(): void;
}) {
  const { intl } = useZCodeIntl();
  const msg = (id: string) => intl.formatMessage({ id: `project.${id}` });
  const preferences = useSidebarSectionsStore();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={sectionDragModifiers}
      onDragEnd={({ active, over }) => {
        if (over) preferences.reorderSections(String(active.id), String(over.id));
      }}
    >
      <SortableContext items={preferences.sectionOrder} strategy={verticalListSortingStrategy}>
        {/* 原因：auto 列被长标题的滚动副本撑宽，溢出检测反复增删副本导致整列闪动；
            单列使用 minmax(0, 1fr)，只由侧栏决定宽度，分页按钮才能稳定居中。 */}
        <div className="grid grid-cols-1 gap-3" data-purpose-section-list="true">
          {preferences.sectionOrder.map((id) => {
            const isProject = id === "projects";
            const isConversation = id === "conversations";
            const title =
              isProject || isConversation
                ? msg(isProject ? "projects" : "tasks")
                : preferences.sections.find((section) => section.id === id)?.name;
            if (!title) return null;
            const section = (
              <WorkspacePurposeSection
                sortableId={id}
                title={title}
                dragHandleLabel={intl.formatMessage(
                  { id: "workspaceSidebar.reorderSection" },
                  { section: title },
                )}
                testId={
                  isProject
                    ? "project-section"
                    : isConversation
                      ? "conversation-section"
                      : "custom-project-section"
                }
                open={
                  isProject
                    ? preferences.projectsExpanded
                    : isConversation
                      ? preferences.conversationsExpanded
                      : preferences.expandedBySectionId[id] !== false
                }
                onOpenChange={(open) => preferences.setSectionExpanded(id, open)}
                action={
                  <>
                    {isProject && (
                      <ControlHintTooltip
                        title={msg(hasExpandedProjects ? "collapseAll" : "expandAll")}
                      >
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-foreground-subtle hover:text-foreground"
                          data-testid="virtual-project-toggle-all"
                          aria-label={msg(hasExpandedProjects ? "collapseAll" : "expandAll")}
                          disabled={!canToggleProjects}
                          onClick={onToggleProjects}
                        >
                          {hasExpandedProjects ? (
                            <ListChevronsDownUp className="size-3.5" />
                          ) : (
                            <ListChevronsUpDown className="size-3.5" />
                          )}
                        </Button>
                      </ControlHintTooltip>
                    )}
                    {isProject || isConversation ? (
                      <ControlHintTooltip title={msg(isProject ? "new" : "createTask")}>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          className="text-foreground-subtle hover:text-foreground"
                          data-testid={
                            isProject ? "virtual-project-add" : "virtual-project-new-task"
                          }
                          aria-label={msg(isProject ? "new" : "createTask")}
                          onClick={isProject ? onAdd : onCreate}
                        >
                          {isProject ? (
                            <Plus className="size-3.5" />
                          ) : (
                            <MessageCirclePlus className="size-3.5" />
                          )}
                        </Button>
                      </ControlHintTooltip>
                    ) : null}
                    {isConversation ? null : <SidebarSectionActions sectionId={id} />}
                  </>
                }
              >
                {isConversation ? tasks : projects(id)}
              </WorkspacePurposeSection>
            );
            return <div key={id}>{section}</div>;
          })}
        </div>
      </SortableContext>
    </DndContext>
  );
}
