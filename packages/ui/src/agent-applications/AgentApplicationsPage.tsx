import { useState } from "react";
import { Plus, RefreshCw, Search } from "lucide-react";
import type { AgentApplicationTest, AgentApplicationView } from "@zcode/shared/agent-applications";
import { Button } from "@/components/ui/button.js";
import { Dialog, DialogContent } from "@/components/ui/dialog.js";
import { Input } from "@/components/ui/input.js";
import { cn } from "@/components/lib/utils.js";
import { useAgentApplications } from "@/hooks/useAgentApplications.js";
import {
  WORKSPACE_PAGE_CONTENT_CLASSNAME,
  WORKSPACE_WIDE_PAGE_MAX_WIDTH_CLASSNAME,
  WorkspacePageHeader,
} from "@/settings/SettingsPageParts.js";
import { AgentApplicationsTable, type AgentApplicationAction } from "./AgentApplicationsTable.js";
import {
  AgentDetails,
  AgentMaintenanceDialog,
  AgentModels,
  AgentTestDialog,
} from "./AgentApplicationDialogs.js";
import { AgentProgramForm } from "./AgentProgramForm.js";
import { useAgentAppError, useAgentAppText } from "./text.js";

type ActiveDialog = {
  action: AgentApplicationAction;
  id?: string;
  fromTest?: boolean;
};

export function AgentApplicationsPage() {
  const t = useAgentAppText();
  const actions = useAgentApplications();
  const [query, setQuery] = useState("");
  const [scanCount, setScanCount] = useState<number | null>(null);
  const [dialog, setDialog] = useState<ActiveDialog | null>(null);
  const [testResult, setTestResult] = useState<AgentApplicationTest | null>(null);
  const message = useAgentAppError(actions.error);
  const selected = actions.apps.find((item) => item.id === dialog?.id);
  const search = query.trim().toLowerCase();
  const filtered = actions.apps.filter((item) =>
    `${item.name} ${item.vendor} ${item.protocol}`.toLowerCase().includes(search),
  );

  async function scan() {
    setScanCount(null);
    const rows = await actions.scan();
    if (rows) setScanCount(rows.filter((app) => app.installed).length);
  }

  function open(action: AgentApplicationAction, app?: AgentApplicationView, fromTest?: boolean) {
    actions.clearError();
    setTestResult(null);
    setDialog({ action, id: app?.id, fromTest });
  }
  function close() {
    if (actions.busy) return;
    if (dialog?.fromTest) open("test", selected);
    else {
      setDialog(null);
      actions.clearError();
    }
  }
  async function maintain(app: AgentApplicationView, action: "upgrade" | "uninstall" | "remove") {
    if (action === "remove") {
      if (await actions.remove(app.id)) setDialog(null);
      return;
    }
    const version = app.latestVersion;
    if (action === "upgrade" && !version) return;
    const updated = await actions.mutate((api) =>
      action === "upgrade" && version ? api.upgrade(app.id, version) : api.uninstall(app.id),
    );
    if (updated) setDialog(null);
  }

  return (
    <div
      className={cn(WORKSPACE_PAGE_CONTENT_CLASSNAME, WORKSPACE_WIDE_PAGE_MAX_WIDTH_CLASSNAME)}
      data-workspace-page-content="true"
      data-testid="agent-applications-page"
    >
      <WorkspacePageHeader
        title={t("title")}
        actions={
          <>
            {actions.available ? (
              <label className="relative block w-48 min-w-0 max-w-full">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-2 left-2 size-4 text-foreground-subtle"
                />
                <Input
                  type="search"
                  className="h-8 pl-8"
                  placeholder={t("search")}
                  aria-label={t("search")}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="lg"
              disabled={actions.loading || actions.busy || !actions.available}
              onClick={() => void scan()}
            >
              <RefreshCw
                aria-hidden="true"
                className={cn(actions.scanning && "motion-safe:animate-spin")}
              />
              {t(actions.scanning ? "scanning" : "scan")}
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={actions.loading || actions.busy || !actions.available}
              data-testid="agent-applications-add"
              onClick={() => open("attach")}
            >
              <Plus aria-hidden="true" />
              {t("attach")}
            </Button>
          </>
        }
      />
      {!actions.available ? (
        <p className="mt-6 text-ui-caption text-foreground-subtle">{t("unavailable")}</p>
      ) : (
        <div className="mt-5 space-y-3">
          {message && !dialog ? (
            <p role="alert" className="text-ui-caption text-destructive">
              {message}
            </p>
          ) : null}
          {actions.loading || filtered.length ? (
            <AgentApplicationsTable
              apps={filtered}
              busy={actions.busy}
              loading={actions.loading}
              onAction={open}
              onToggle={(app, enabled) =>
                void actions.mutate((api) => api.setEnabled(app.id, enabled))
              }
            />
          ) : !message ? (
            <p className="py-6 text-center text-ui-caption text-foreground-subtle">
              {t("noMatches")}
            </p>
          ) : null}
          {scanCount !== null ? (
            <p role="status" className="text-ui-sm text-foreground-subtle">
              {t("scanFinished", { count: scanCount })}
            </p>
          ) : null}
        </div>
      )}
      {dialog ? (
        <Dialog
          open
          onOpenChange={(opened) => {
            if (!opened) close();
          }}
        >
          <DialogContent
            className="max-h-[calc(100dvh-3rem)] overflow-y-auto sm:max-w-lg"
            showCloseButton={!actions.busy}
          >
            {dialog.action === "attach" || dialog.action === "edit" ? (
              <AgentProgramForm
                key={dialog.id ?? "new"}
                app={selected}
                apps={actions.apps}
                editing={dialog.action === "edit"}
                busy={actions.busy}
                onClose={close}
                onSave={async (input) => {
                  const result = await actions.mutate((api) => api.saveProgram(input));
                  if (result) {
                    setQuery("");
                    setDialog(null);
                  }
                }}
              />
            ) : null}
            {dialog.action === "detail" && selected ? (
              <AgentDetails
                app={selected}
                onEdit={() => open("edit", selected)}
                onModels={() => open("models", selected)}
                onTest={() => open("test", selected)}
              />
            ) : null}
            {dialog.action === "models" && selected ? (
              <AgentModels
                app={selected}
                busy={actions.busy}
                readingModels={actions.readingModels}
                fromTest={Boolean(dialog.fromTest)}
                onClose={close}
                onRead={() => void actions.readModels(selected.id)}
                onSelect={(modelId, enabled) =>
                  void actions.mutate((api) => api.setModelEnabled(selected.id, modelId, enabled))
                }
              />
            ) : null}
            {dialog.action === "test" && selected ? (
              <AgentTestDialog
                app={selected}
                result={testResult}
                busy={actions.busy}
                onClose={close}
                onModels={() => open("models", selected, true)}
                onCancel={() => void actions.cancelTest(selected.id)}
                onRetry={() => setTestResult(null)}
                onStart={(modelId) => {
                  void actions.test(selected.id, modelId).then((result) => {
                    if (result) setTestResult(result.result);
                  });
                }}
              />
            ) : null}
            {(dialog.action === "remove" ||
              dialog.action === "upgrade" ||
              dialog.action === "uninstall") &&
            selected ? (
              <AgentMaintenanceDialog
                app={selected}
                action={dialog.action}
                busy={actions.busy}
                onClose={close}
                onConfirm={() => {
                  const action = dialog.action;
                  if (action === "upgrade" || action === "uninstall" || action === "remove")
                    void maintain(selected, action);
                }}
              />
            ) : null}
            {message ? (
              <p role="alert" className="text-ui-caption text-destructive">
                {message}
              </p>
            ) : null}
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
