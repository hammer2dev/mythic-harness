import { useState } from "react";
import { ArrowRight, Boxes, FlaskConical, RefreshCw } from "lucide-react";
import {
  AGENT_APPLICATION_TEST_PROMPT,
  type AgentApplicationTest,
  type AgentApplicationView,
} from "@zcode/shared/agent-applications";
import { Button } from "@/components/ui/button.js";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { AGENT_SELECT_CLASS } from "./AgentProgramForm.js";
import { useAgentAppError, useAgentAppText } from "./text.js";

function FormHeading({ title, app }: { title: string; app: AgentApplicationView }) {
  return (
    <DialogHeader>
      <DialogTitle>{title}</DialogTitle>
      <DialogDescription>{app.name}</DialogDescription>
    </DialogHeader>
  );
}

function TestSummary({ test, showReply }: { test: AgentApplicationTest; showReply?: boolean }) {
  const t = useAgentAppText();
  const { locale } = useZCodeIntl();
  const detail = useAgentAppError(test.error ?? null);
  const time = new Intl.DateTimeFormat(locale, { dateStyle: "short", timeStyle: "short" }).format(
    test.at,
  );
  return (
    <div className="space-y-0.5">
      <p
        className={
          test.passed
            ? "font-medium text-success-surface-foreground"
            : "font-medium text-destructive"
        }
      >
        {t(test.passed ? "passed" : "failed")}
      </p>
      <p className="text-ui-sm text-foreground-subtle">
        {test.modelName} · {time} ·{" "}
        {new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(test.elapsedMs / 1000)}{" "}
        s
      </p>
      {detail ? <p className="text-ui-caption text-foreground">{detail}</p> : null}
      {showReply && test.reply ? (
        <p className="whitespace-pre-wrap wrap-anywhere text-ui-caption">{test.reply}</p>
      ) : null}
    </div>
  );
}

export function AgentDetails({
  app,
  onEdit,
  onModels,
  onTest,
}: {
  app: AgentApplicationView;
  onEdit(): void;
  onModels(): void;
  onTest(): void;
}) {
  const t = useAgentAppText();
  const models = app.models.filter((model) => model.enabled);
  const rows = [
    [t("localProgram"), app.version ?? (app.installed ? t("unknownVersion") : t("uninstalled"))],
    [t("path"), app.path || "—"],
    [t("args"), app.args.join("\n") || "—"],
    [t("enabled"), t(app.enabled ? "on" : "off")],
    [t("enabledModels"), models.map((model) => model.name).join(" · ") || "—"],
    [t("testStatus"), t(app.test ? (app.test.passed ? "passed" : "failed") : "notTested")],
  ];
  return (
    <>
      <FormHeading title={t("detail")} app={app} />
      <dl className="divide-y divide-border text-ui-caption">
        {rows.map(([label, value]) => (
          <div key={label} className="grid grid-cols-[7rem_minmax(0,1fr)] gap-2 py-2">
            <dt className="text-foreground-subtle">{label}</dt>
            <dd className="whitespace-pre-wrap wrap-anywhere">{value}</dd>
          </div>
        ))}
      </dl>
      <section>
        <h3 className="mb-2 font-medium">{t("history")}</h3>
        {app.history.length ? (
          <ul className="max-h-48 space-y-3 overflow-y-auto">
            {app.history.map((test, index) => (
              <li key={`${test.at}:${index}`}>
                <TestSummary test={test} showReply />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ui-caption text-foreground-subtle">{t("noHistory")}</p>
        )}
      </section>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onEdit}>
          {t("edit")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={!app.installed || !app.attached}
          onClick={onModels}
        >
          <Boxes aria-hidden="true" />
          {t("models")}
        </Button>
        <Button type="button" disabled={!app.installed || !app.attached} onClick={onTest}>
          <FlaskConical aria-hidden="true" />
          {t("test")}
        </Button>
      </DialogFooter>
    </>
  );
}

export function AgentModels({
  app,
  busy,
  readingModels,
  fromTest,
  onRead,
  onSelect,
  onClose,
}: {
  app: AgentApplicationView;
  busy: boolean;
  readingModels: boolean;
  fromTest: boolean;
  onRead(): void;
  onSelect(id: string, enabled: boolean): void;
  onClose(): void;
}) {
  const t = useAgentAppText();
  return (
    <>
      <FormHeading title={t("models")} app={app} />
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-ui-caption font-medium">{t("candidateModels")}</h3>
        <Button
          type="button"
          variant="outline"
          data-testid="agent-models-read"
          disabled={busy}
          aria-busy={readingModels}
          className={readingModels ? "disabled:opacity-100" : undefined}
          onClick={onRead}
        >
          <RefreshCw
            aria-hidden="true"
            className={readingModels ? "motion-safe:animate-spin" : undefined}
          />
          {t(readingModels ? "readingModels" : "readModels")}
        </Button>
      </div>
      <span role="status" className="sr-only">
        {readingModels ? t("readingModels") : ""}
      </span>
      {app.models.length ? (
        <ul className="max-h-64 divide-y divide-border overflow-y-auto">
          {app.models.map((model) => (
            <li key={model.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-ui-caption font-medium" title={model.name}>
                  {model.name}
                </p>
                <p className="truncate font-mono text-ui-sm text-foreground-subtle">{model.id}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {!model.available ? (
                  <span className="text-ui-sm text-foreground-subtle">{t("notAvailable")}</span>
                ) : model.selected ? (
                  <span className="text-ui-sm text-foreground-subtle">
                    {t(model.enabled ? "on" : "off")}
                  </span>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || (!model.available && !model.enabled)}
                  data-model-id={model.id}
                  onClick={() => onSelect(model.id, !model.enabled)}
                >
                  {t(!model.selected ? "addModel" : model.enabled ? "disable" : "enable")}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="min-h-4 text-ui-caption text-foreground-subtle">
          {readingModels ? null : t("noCandidates")}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          {t(fromTest ? "backToTest" : "close")}
        </Button>
      </DialogFooter>
    </>
  );
}

export function AgentTestDialog({
  app,
  busy,
  result,
  onStart,
  onCancel,
  onModels,
  onClose,
  onRetry,
}: {
  app: AgentApplicationView;
  busy: boolean;
  result: AgentApplicationTest | null;
  onStart(modelId: string): void;
  onCancel(): void;
  onModels(): void;
  onClose(): void;
  onRetry(): void;
}) {
  const t = useAgentAppText();
  const choices = app.models.filter((model) => model.enabled && model.available);
  const [selection, setSelection] = useState(app.test?.modelId ?? "");
  const model = choices.find(({ id }) => id === selection) ?? choices[0];
  const completed = result;
  return (
    <>
      <FormHeading title={t("test")} app={app} />
      {completed ? (
        <div className="space-y-3">
          <TestSummary test={completed} />
          {completed.reply ? (
            <div>
              <h3 className="mb-1 text-ui-caption font-medium">{t("reply")}</h3>
              <pre
                className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-surface p-3 text-ui-caption"
                data-testid="agent-test-reply"
              >
                {completed.reply}
              </pre>
            </div>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {model ? (
            <label className="grid gap-1.5">
              {t("testModel")}
              <select
                name="test-model"
                className={AGENT_SELECT_CLASS}
                value={model.id}
                disabled={busy}
                onChange={(event) => setSelection(event.target.value)}
              >
                {choices.map(({ id, name }) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-surface p-2 text-ui-caption">
              {t("enableModelFirst")}
              <Button type="button" variant="outline" onClick={onModels} disabled={busy}>
                {t("models")}
              </Button>
            </div>
          )}
          <div>
            <h3 className="mb-1 text-ui-caption font-medium">{t("prompt")}</h3>
            <p className="rounded-lg border border-border bg-surface p-2 font-mono text-ui-caption">
              {AGENT_APPLICATION_TEST_PROMPT}
            </p>
          </div>
          <p role={busy ? "status" : undefined} className="text-ui-sm text-foreground-subtle">
            {t(busy ? "testing" : "testQuota")}
          </p>
        </div>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={busy ? onCancel : onClose}>
          {t(busy ? "cancelTest" : completed ? "close" : "cancel")}
        </Button>
        {!busy ? (
          completed ? (
            <Button type="button" onClick={onRetry}>
              {t("testAgain")}
            </Button>
          ) : (
            <Button
              type="button"
              disabled={!model}
              data-testid="agent-test-start"
              onClick={() => {
                if (model) onStart(model.id);
              }}
            >
              {t("startTest")}
            </Button>
          )
        ) : null}
      </DialogFooter>
    </>
  );
}

export function AgentMaintenanceDialog({
  app,
  action,
  busy,
  onConfirm,
  onClose,
}: {
  app: AgentApplicationView;
  action: "remove" | "upgrade" | "uninstall";
  busy: boolean;
  onConfirm(): void;
  onClose(): void;
}) {
  const t = useAgentAppText();
  const supported = action === "remove" || app.source === "npm";
  return (
    <>
      <FormHeading title={t(action)} app={app} />
      {action === "upgrade" ? (
        <div className="flex items-center gap-2 font-mono">
          {app.version}
          <ArrowRight aria-hidden="true" className="size-4" />
          {app.latestVersion}
        </div>
      ) : null}
      <p className="text-ui-caption text-foreground-subtle">
        {supported ? t(`${action}Effect`) : t("error.originalChannel")}
      </p>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          {t(supported ? "cancel" : "close")}
        </Button>
        {supported ? (
          <Button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            variant={action === "upgrade" ? "default" : "destructive"}
          >
            {t(busy ? "working" : action)}
          </Button>
        ) : null}
      </DialogFooter>
    </>
  );
}
