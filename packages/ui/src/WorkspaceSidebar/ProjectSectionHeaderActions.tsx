import { Cloud, FolderPlus, Plus } from "lucide-react";
import { TID_PROJECT_ADD } from "@zcode/shared";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { SidebarSectionActions } from "./SidebarSectionActions.js";

export function ProjectSectionHeaderActions({
  sectionId,
  onCreateProject,
  onOpenRemote,
}: {
  sectionId: string;
  onCreateProject: () => void;
  onOpenRemote?: () => void;
}) {
  const { intl } = useZCodeIntl();
  return (
    <>
      <SidebarSectionActions sectionId={sectionId} />
      {sectionId === "projects" ? (
        <DropdownMenu>
          <ControlHintTooltip title={intl.formatMessage({ id: "workspaceSidebar.addProject" })}>
            <DropdownMenuTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="text-foreground-subtle hover:text-foreground data-[state=open]:text-foreground"
                aria-label={intl.formatMessage({ id: "workspaceSidebar.addProject" })}
                data-testid={TID_PROJECT_ADD}
              >
                <Plus className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
          </ControlHintTooltip>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem onSelect={onCreateProject}>
              <FolderPlus className="size-4" />
              {intl.formatMessage({ id: "project.create" })}
            </DropdownMenuItem>
            {onOpenRemote ? (
              <DropdownMenuItem onSelect={onOpenRemote}>
                <Cloud className="size-4" />
                {intl.formatMessage({ id: "remote.trigger" })}
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  );
}
