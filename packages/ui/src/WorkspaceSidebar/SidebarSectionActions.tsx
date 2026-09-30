import { useState } from "react";
import { Ellipsis, FolderPlus, Pencil, Trash2 } from "lucide-react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { useSidebarSectionsStore } from "@/store/sidebarSectionsStore.js";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { SidebarSectionDialog } from "./SidebarSectionDialog.js";

export function SidebarSectionActions({ sectionId }: { sectionId: string }) {
  const { intl } = useZCodeIntl();
  const section = useSidebarSectionsStore((state) =>
    state.sections.find((item) => item.id === sectionId),
  );
  const createSection = useSidebarSectionsStore((state) => state.createSection);
  const renameSection = useSidebarSectionsStore((state) => state.renameSection);
  const removeSection = useSidebarSectionsStore((state) => state.removeSection);
  const [dialog, setDialog] = useState<"new" | "rename" | null>(null);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={intl.formatMessage({ id: "sidebarSection.more" })}
            className="text-foreground-subtle hover:text-foreground"
          >
            <Ellipsis className="size-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setDialog("new")}>
            <FolderPlus className="size-4" />
            {intl.formatMessage({ id: "sidebarSection.new" })}
          </DropdownMenuItem>
          {section ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setDialog("rename")}>
                <Pencil className="size-4" />
                {intl.formatMessage({ id: "sidebarSection.rename" })}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => removeSection(sectionId)}>
                <Trash2 className="size-4" />
                {intl.formatMessage({ id: "sidebarSection.delete" })}
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {dialog ? (
        <SidebarSectionDialog
          title={intl.formatMessage({
            id: dialog === "new" ? "sidebarSection.new" : "sidebarSection.rename",
          })}
          initialName={dialog === "rename" ? section?.name : ""}
          onClose={() => setDialog(null)}
          onSubmit={(name) => {
            if (dialog === "new") createSection(name);
            else renameSection(sectionId, name);
          }}
        />
      ) : null}
    </>
  );
}
