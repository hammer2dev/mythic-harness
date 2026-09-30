import { useState, type ReactElement } from "react";
import { Folder, MessageCircle, Settings2 } from "lucide-react";
import type { WorkspaceProjectDefinition } from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function ProjectDetailsCard({
  project,
  taskCount,
  loading,
  connectionLabel,
  disabled = false,
  onEdit,
  children,
}: {
  project: WorkspaceProjectDefinition;
  taskCount: number;
  loading: boolean;
  connectionLabel?: string;
  disabled?: boolean;
  onEdit: () => void;
  children: ReactElement;
}) {
  const { intl } = useZCodeIntl();
  const [open, setOpen] = useState(false);
  return (
    <HoverCard open={open && !disabled} onOpenChange={setOpen}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side="right"
        align="start"
        className="w-96 max-w-[calc(100vw-2rem)] rounded-xl border border-popover-border p-3 ring-0"
        data-testid="project-details-card"
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-2 font-medium">
          <Folder className="mt-0.5 size-4 shrink-0 text-foreground-subtle" />
          <span className="min-w-0 break-words">{project.name}</span>
        </div>
        <div className="mt-2 flex items-center gap-2 text-foreground-subtle">
          <MessageCircle className="size-4 shrink-0" />
          {loading
            ? intl.formatMessage({ id: "common.loading" })
            : intl.formatMessage({ id: "project.taskCount" }, { count: taskCount })}
        </div>
        {connectionLabel ? (
          <p className="mt-2 break-all font-mono text-ui-sm text-foreground-subtle">
            {connectionLabel}
          </p>
        ) : null}
        <ul className="my-3 max-h-64 space-y-2 overflow-y-auto">
          {project.folders.map((folder) => (
            <li key={folder.id} className="flex items-start gap-2">
              <Folder className="mt-0.5 size-4 shrink-0 text-foreground-subtle" />
              <span className="min-w-0 flex-1 break-all font-mono text-ui-sm">
                {folder.workspacePath}
              </span>
              {folder.id === project.primaryFolderId ? (
                <span className="shrink-0 text-ui-xs text-foreground-subtlest">
                  {intl.formatMessage({ id: "project.primaryFolder" })}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
        <div className="border-t border-border pt-2">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start"
            onClick={() => {
              setOpen(false);
              onEdit();
            }}
          >
            <Settings2 className="size-4" />
            {intl.formatMessage({ id: "project.edit" })}
          </Button>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
