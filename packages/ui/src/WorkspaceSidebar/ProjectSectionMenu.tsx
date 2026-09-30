import { Check, FolderPlus, PanelsTopLeft } from "lucide-react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useSidebarSectionsStore } from "@/store/sidebarSectionsStore.js";
import {
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from "@/components/ui/context-menu.js";
import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@/components/ui/dropdown-menu.js";

const menuComponents = {
  context: {
    Item: ContextMenuItem,
    Separator: ContextMenuSeparator,
    Sub: ContextMenuSub,
    Content: ContextMenuSubContent,
    Trigger: ContextMenuSubTrigger,
  },
  dropdown: {
    Item: DropdownMenuItem,
    Separator: DropdownMenuSeparator,
    Sub: DropdownMenuSub,
    Content: DropdownMenuSubContent,
    Trigger: DropdownMenuSubTrigger,
  },
};

export function ProjectSectionMenu({
  kind,
  workspaceKey,
  onCreate,
}: {
  kind: keyof typeof menuComponents;
  workspaceKey: string;
  onCreate: () => void;
}) {
  const { intl } = useZCodeIntl();
  const sections = useSidebarSectionsStore((state) => state.sections);
  const sectionOrder = useSidebarSectionsStore((state) => state.sectionOrder);
  const currentId = useSidebarSectionsStore(
    (state) => state.projectSectionByWorkspaceKey[workspaceKey] ?? "projects",
  );
  const moveProject = useSidebarSectionsStore((state) => state.moveProject);
  const { Item, Separator, Sub, Content, Trigger } = menuComponents[kind];
  return (
    <Sub>
      <Trigger>
        <PanelsTopLeft className="size-4" />
        {intl.formatMessage({ id: "sidebarSection.move" })}
      </Trigger>
      <Content className="min-w-40 max-w-64">
        {sectionOrder
          .filter((id) => id !== "conversations")
          .map((id) => (
            <Item
              key={id}
              role="menuitemradio"
              aria-checked={id === currentId}
              onSelect={() => moveProject(workspaceKey, id)}
            >
              <span className="flex size-4 shrink-0 items-center">
                {id === currentId ? <Check className="size-4" /> : null}
              </span>
              <span className="truncate">
                {id === "projects"
                  ? intl.formatMessage({ id: "workspaceSidebar.projectsSection" })
                  : sections.find((section) => section.id === id)?.name}
              </span>
            </Item>
          ))}
        <Separator />
        <Item onSelect={onCreate}>
          <FolderPlus className="size-4" />
          {intl.formatMessage({ id: "sidebarSection.new" })}
        </Item>
      </Content>
    </Sub>
  );
}
