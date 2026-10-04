import { useId, useState } from "react";
import { Folder, FolderPlus, X } from "lucide-react";
import { createUuid, type WorkspaceProjectFolder } from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export type ProjectCreateDraft = {
  name: string;
  folders: WorkspaceProjectFolder[];
  primaryFolderId: string;
};

function normalizeLocalPath(path: string): string {
  const normalized = path.replaceAll("\\", "/").replace(/\/+$/, "");
  return /^[a-z]:/i.test(normalized) ? normalized.toLowerCase() : normalized;
}

function folderName(path: string): string {
  return (
    path
      .replace(/[/\\]+$/, "")
      .split(/[/\\]/)
      .pop() || path
  );
}

export function ProjectCreateDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (draft: ProjectCreateDraft) => void;
}) {
  const { intl } = useZCodeIntl();
  const platform = useOptionalPlatform();
  const nameId = useId();
  const [name, setName] = useState("");
  const [folders, setFolders] = useState<WorkspaceProjectFolder[]>([]);
  const [primaryFolderId, setPrimaryFolderId] = useState<string>();
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addFolder = (path: string) => {
    const normalizedPath = normalizeLocalPath(path);
    if (folders.some((folder) => normalizeLocalPath(folder.workspacePath) === normalizedPath)) {
      setError(intl.formatMessage({ id: "project.folderAlreadyAdded" }));
      return;
    }

    const folder = { id: createUuid(), workspacePath: path };
    setFolders((current) => [...current, folder]);
    setPrimaryFolderId((current) => current ?? folder.id);
    setName((current) => (current.trim() ? current : folderName(path)));
    setError(null);
  };

  const chooseFolder = async () => {
    if (!platform?.canSelectFilePath) {
      setError(intl.formatMessage({ id: "project.localFolderUnavailable" }));
      return;
    }

    setPicking(true);
    setError(null);
    try {
      const path = await platform.selectDirectory();
      if (path) addFolder(path);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setPicking(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-xl"
        aria-describedby={undefined}
        data-testid="project-create-dialog"
      >
        <DialogHeader>
          <DialogTitle>{intl.formatMessage({ id: "project.create" })}</DialogTitle>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim() || folders.length === 0 || !primaryFolderId) return;
            onCreate({ name: name.trim(), folders, primaryFolderId });
            onClose();
          }}
        >
          <label htmlFor={nameId} className="sr-only">
            {intl.formatMessage({ id: "project.name" })}
          </label>
          <div className="relative">
            <Folder className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-foreground-subtle" />
            <Input
              id={nameId}
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={intl.formatMessage({ id: "project.name" })}
              className="pl-9 text-mobile-input-safe sm:text-ui-base"
            />
          </div>
          <div className="space-y-2">
            <p className="font-medium">{intl.formatMessage({ id: "project.sourceFolders" })}</p>
            <div className="overflow-hidden rounded-xl border border-border">
              {folders.length > 0 ? (
                <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                  {folders.map((folder) => {
                    const primary = folder.id === primaryFolderId;
                    return (
                      <li key={folder.id} className="flex items-center gap-2 px-3 py-3">
                        <Folder className="size-4 shrink-0 text-foreground-subtle" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate">{folderName(folder.workspacePath)}</p>
                          <p
                            className="truncate font-mono text-ui-sm text-foreground-subtlest"
                            title={folder.workspacePath}
                          >
                            {folder.workspacePath}
                          </p>
                        </div>
                        {primary ? (
                          <span className="shrink-0 rounded-md border border-border px-2 py-1 text-ui-sm text-foreground-subtle">
                            {intl.formatMessage({ id: "project.primaryFolder" })}
                          </span>
                        ) : (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setPrimaryFolderId(folder.id)}
                          >
                            {intl.formatMessage({ id: "project.makePrimary" })}
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={intl.formatMessage(
                            { id: "project.removeFolder" },
                            { path: folder.workspacePath },
                          )}
                          onClick={() => {
                            setFolders((current) =>
                              current.filter((item) => item.id !== folder.id),
                            );
                            if (primary) {
                              const next = folders.find((item) => item.id !== folder.id);
                              setPrimaryFolderId(next?.id);
                            }
                          }}
                        >
                          <X className="size-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="px-4 py-8 text-center text-ui-base text-foreground-subtle">
                  {intl.formatMessage({ id: "project.addFolderOnComputer" })}
                </div>
              )}
              <Button
                type="button"
                variant="ghost"
                className="h-11 w-full justify-start rounded-none border-t border-border px-3"
                disabled={picking}
                onClick={() => void chooseFolder()}
              >
                <FolderPlus className="size-4" />
                {intl.formatMessage({ id: "project.addFolder" })}
              </Button>
            </div>
            {error ? (
              <p role="alert" className="text-ui-sm text-destructive">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              {intl.formatMessage({ id: "common.cancel" })}
            </Button>
            <Button type="submit" disabled={!name.trim() || folders.length === 0 || picking}>
              {intl.formatMessage({ id: "project.create" })}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
