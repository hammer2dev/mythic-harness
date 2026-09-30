import { useId, useState } from "react";
import { Folder, FolderPlus, X } from "lucide-react";
import {
  createUuid,
  isRemoteWorkspaceIdentity,
  replaceRemoteWorkspaceIdentityPath,
  type WorkspaceProjectDefinition,
} from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { DirectoryBrowser } from "@/DirectoryBrowser.js";
import { useOptionalPlatform } from "@/hooks/usePlatform.js";
import { useWorkspaceServices } from "@/hooks/useWorkspaceServices.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { buildRemoteWorkspaceIdentity } from "@/lib/remoteWorkspaceHistory.js";
import type { WorkspaceTabState } from "@/store/tabStore.js";

type ProjectEdit = Pick<WorkspaceProjectDefinition, "name" | "folders" | "primaryFolderId">;

export function ProjectEditDialog({
  tab,
  project,
  onClose,
  onSave,
  onRemove,
}: {
  tab: WorkspaceTabState;
  project: WorkspaceProjectDefinition;
  onClose: () => void;
  onSave: (project: ProjectEdit) => void;
  onRemove: () => Promise<void>;
}) {
  const { intl } = useZCodeIntl();
  const nameId = useId();
  const platform = useOptionalPlatform();
  const services = useWorkspaceServices(
    tab.workspacePath,
    tab.remoteSessionId,
    tab.workspaceIdentity,
    tab.remoteTarget,
  );
  const [name, setName] = useState(project.name);
  const [folders, setFolders] = useState(project.folders);
  const [primaryFolderId, setPrimaryFolderId] = useState(project.primaryFolderId);
  const [browsing, setBrowsing] = useState(false);
  const [selectedPath, setSelectedPath] = useState("");
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isRemote = Boolean(tab.remoteTarget || tab.remoteSessionId || tab.workspaceIdentity);
  const canAddFolder =
    !isRemote ||
    Boolean(
      tab.remoteSessionId &&
      (tab.remoteTarget || isRemoteWorkspaceIdentity(tab.workspaceIdentity ?? "")),
    );

  const addFolder = (path: string) => {
    const workspaceIdentity = tab.remoteTarget
      ? buildRemoteWorkspaceIdentity(path, tab.remoteTarget)
      : tab.workspaceIdentity
        ? (replaceRemoteWorkspaceIdentityPath(tab.workspaceIdentity, path) ?? undefined)
        : undefined;
    const pathKey = (value: string) => {
      const normalized = value.replaceAll("\\", "/").replace(/\/+$/, "");
      return /^[a-z]:/i.test(normalized) ? normalized.toLowerCase() : normalized;
    };
    if (folders.some((folder) => pathKey(folder.workspacePath) === pathKey(path))) {
      setError(intl.formatMessage({ id: "project.folderAlreadyAdded" }));
      setBrowsing(false);
      return;
    }
    setFolders((current) => [
      ...current,
      {
        id: createUuid(),
        workspacePath: path,
        ...(workspaceIdentity ? { workspaceIdentity } : {}),
      },
    ]);
    setError(null);
    setBrowsing(false);
  };

  const chooseFolder = async () => {
    setError(null);
    if (isRemote || !platform?.canSelectFilePath) {
      setSelectedPath("");
      setBrowsing(true);
      return;
    }
    setPicking(true);
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
        data-testid="project-edit-dialog"
      >
        <DialogHeader>
          <DialogTitle>
            {intl.formatMessage({ id: browsing ? "project.addFolder" : "project.edit" })}
          </DialogTitle>
        </DialogHeader>
        {browsing ? (
          <>
            <div className="flex h-96 min-h-0 flex-col">
              <DirectoryBrowser
                services={services}
                embedded
                onSelect={addFolder}
                onCancel={() => setBrowsing(false)}
                onPathChange={setSelectedPath}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setBrowsing(false)}>
                {intl.formatMessage({ id: "common.back" })}
              </Button>
              <Button
                type="button"
                disabled={!selectedPath}
                onClick={() => addFolder(selectedPath)}
              >
                {intl.formatMessage({ id: "directoryBrowser.selectDir" })}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!name.trim()) return;
              onSave({ name: name.trim(), folders, primaryFolderId });
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
                className="pl-9 text-mobile-input-safe sm:text-ui-base"
              />
            </div>
            <div className="space-y-2">
              <p className="font-medium">{intl.formatMessage({ id: "project.sourceFolders" })}</p>
              <div className="overflow-hidden rounded-xl border border-border">
                <ul className="max-h-80 divide-y divide-border overflow-y-auto">
                  {folders.map((folder) => {
                    const primary = folder.id === primaryFolderId;
                    return (
                      <li key={folder.id} className="flex items-center gap-2 px-3 py-3">
                        <Folder className="size-4 shrink-0 text-foreground-subtle" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate">
                            {folder.workspacePath
                              .replace(/[/\\]+$/, "")
                              .split(/[/\\]/)
                              .pop() || folder.workspacePath}
                          </p>
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
                          disabled={primary}
                          aria-label={intl.formatMessage(
                            { id: "project.removeFolder" },
                            { path: folder.workspacePath },
                          )}
                          title={
                            primary
                              ? intl.formatMessage({ id: "project.primaryRemovalHint" })
                              : undefined
                          }
                          onClick={() =>
                            setFolders((current) => current.filter((item) => item.id !== folder.id))
                          }
                        >
                          <X className="size-4" />
                        </Button>
                      </li>
                    );
                  })}
                </ul>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-11 w-full justify-start rounded-none border-t border-border px-3"
                  disabled={!canAddFolder || picking}
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
              {!canAddFolder ? (
                <p className="text-ui-sm text-foreground-subtle">
                  {intl.formatMessage({ id: "project.connectToAddFolder" })}
                </p>
              ) : null}
            </div>
            <DialogFooter className="items-stretch sm:items-center">
              <Button
                type="button"
                variant="ghost"
                className="text-destructive sm:mr-auto"
                onClick={() => void onRemove()}
              >
                {intl.formatMessage({ id: "project.remove" })}
              </Button>
              <Button type="button" variant="ghost" onClick={onClose}>
                {intl.formatMessage({ id: "common.cancel" })}
              </Button>
              <Button type="submit" disabled={!name.trim() || picking}>
                {intl.formatMessage({ id: "common.save" })}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
