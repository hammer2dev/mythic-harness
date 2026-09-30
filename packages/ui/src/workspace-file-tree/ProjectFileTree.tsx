import { useRef, useState } from "react";
import { ArrowLeft, Search, X } from "lucide-react";
import { TID_WORKSPACE_FILE_TREE_PANEL, type WorkspaceProjectDefinition } from "@zcode/shared";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useOptionalTabStore } from "@/store/TabStoreProvider.js";
import { isWorkspaceTab } from "@/store/tabStore.js";
import { isWorkspaceProjectScope } from "@/lib/workspaceProject.js";
import { getPathLeaf } from "@/lib/path.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { WorkspaceFileTree as SingleRootFileTree } from "./WorkspaceFileTree.js";
import { isWorkspaceFilePathInside } from "./model.js";
import type { WorkspaceFileTreeProps } from "./types.js";

function ProjectFileTree({
  project,
  ...props
}: WorkspaceFileTreeProps & {
  project: WorkspaceProjectDefinition;
}) {
  const { intl } = useZCodeIntl();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [query, setQuery] = useState("");
  const [collapsedRoots, setCollapsedRoots] = useState<Set<string>>(() => new Set());
  return (
    <section
      className="flex h-full min-h-0 flex-col text-foreground"
      data-testid={TID_WORKSPACE_FILE_TREE_PANEL}
    >
      <div className="px-2 pb-3 pt-3">
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="w-full justify-start gap-2 rounded-xl px-2.5 text-foreground-subtle hover:bg-surface-hover hover:text-foreground"
          onClick={props.onClose}
        >
          <ArrowLeft className="size-4 shrink-0" />
          {intl.formatMessage({ id: "workspaceFileTree.backToTasks" })}
        </Button>
      </div>
      <div className="px-2 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-foreground-subtlest" />
          <Input
            value={query}
            className="h-7 bg-transparent pl-7 pr-7 focus-visible:bg-input-focused"
            placeholder={intl.formatMessage({ id: "workspaceFileTree.searchPlaceholder" })}
            aria-label={intl.formatMessage({ id: "workspaceFileTree.searchLabel" })}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          {query ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              className="absolute right-1 top-1/2 -translate-y-1/2"
              aria-label={intl.formatMessage({ id: "workspaceFileTree.clearSearch" })}
              onClick={() => setQuery("")}
            >
              <X className="size-3" />
            </Button>
          ) : null}
        </div>
        <h3 className="truncate px-2.5 pt-3 text-ui-base font-medium text-foreground-subtlest">
          {project.name}
        </h3>
      </div>
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-auto"
        style={{ overflowAnchor: "none" }}
      >
        <div>
          {project.folders.map((folder) => {
            const reveal = props.revealPath?.trim();
            const revealInRoot = Boolean(
              reveal && isWorkspaceFilePathInside(folder.workspacePath, reveal),
            );
            const expanded = revealInRoot || !collapsedRoots.has(folder.id);
            return (
              <SingleRootFileTree
                {...props}
                key={folder.id}
                workspacePath={folder.workspacePath}
                workspaceIdentity={folder.workspaceIdentity}
                workspaceName={getPathLeaf(folder.workspacePath) || folder.workspacePath}
                revealPath={revealInRoot ? reveal : undefined}
                embedded={{
                  scrollRef,
                  searchQuery: query,
                  onSearchQueryChange: setQuery,
                  expanded,
                  onToggleExpanded: () =>
                    setCollapsedRoots((current) => {
                      const next = new Set(current);
                      if (next.has(folder.id)) next.delete(folder.id);
                      else next.add(folder.id);
                      return next;
                    }),
                }}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function WorkspaceFileTree(props: WorkspaceFileTreeProps) {
  const project = useOptionalTabStore((state) => {
    const candidates = state.tabs.filter(
      (tab) =>
        isWorkspaceTab(tab) &&
        (props.projectId
          ? tab.project?.id === props.projectId
          : isWorkspaceProjectScope(tab, props)),
    );
    const match = candidates.find((tab) => tab.id === state.activeTabId) ?? candidates[0];
    return match && isWorkspaceTab(match) ? match.project : undefined;
  });
  if (project && !props.temporaryExternalDirectory) {
    if (project.folders.length > 1)
      return <ProjectFileTree key={project.id} {...props} project={project} />;
    const folder = project.folders[0]!;
    return (
      <SingleRootFileTree
        {...props}
        workspacePath={folder.workspacePath}
        workspaceIdentity={folder.workspaceIdentity}
        workspaceName={project.name}
      />
    );
  }
  return <SingleRootFileTree {...props} />;
}
