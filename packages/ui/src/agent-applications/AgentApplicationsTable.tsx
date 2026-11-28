import {
  Boxes,
  Ellipsis,
  FlaskConical,
  Pencil,
  Plug,
  RefreshCw,
  SquareTerminal,
  Trash2,
} from "lucide-react";
import type { AgentApplicationView } from "@zcode/shared/agent-applications";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { Switch } from "@/components/ui/switch.js";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import codex from "./assets/openai.svg";
import claude from "./assets/claude.svg";
import gemini from "./assets/gemini.png";
import kimi from "./assets/kimi.png";
import opencode from "./assets/opencode-light.svg";
import opencodeDark from "./assets/opencode-dark.svg";
import { useAgentAppText } from "./text.js";

export type AgentApplicationAction =
  | "attach"
  | "detail"
  | "edit"
  | "models"
  | "test"
  | "remove"
  | "upgrade"
  | "uninstall";

const logos: Record<string, string> = { codex, claude, gemini, kimi, opencode };
const actions = [
  { action: "edit", Icon: Pencil },
  { action: "models", Icon: Boxes },
  { action: "test", Icon: FlaskConical },
] as const;

type TableProps = {
  apps: readonly AgentApplicationView[];
  busy: boolean;
  onAction(action: AgentApplicationAction, app: AgentApplicationView): void;
  onToggle(app: AgentApplicationView, enabled: boolean): void;
};

function AppLogo({ app }: { app: AgentApplicationView }) {
  const logo = logos[app.id];
  return (
    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border bg-background">
      {logo ? (
        <picture>
          {app.id === "opencode" ? (
            <img src={opencodeDark} alt="" className="hidden size-5 dark:block" />
          ) : null}
          <img
            src={logo}
            alt=""
            className={
              app.id === "opencode"
                ? "size-5 dark:hidden"
                : app.id === "codex"
                  ? "size-5 dark:invert"
                  : "size-5"
            }
          />
        </picture>
      ) : (
        <SquareTerminal aria-hidden="true" className="size-5 text-foreground-subtle" />
      )}
    </span>
  );
}

function ApplicationRow({
  app,
  busy,
  onAction,
  onToggle,
}: Omit<TableProps, "apps"> & {
  app: AgentApplicationView;
}) {
  const t = useAgentAppText();
  const ready = app.attached && app.installed;
  const actionLabel = (name: string) => `${app.name} · ${t(name)}`;
  return (
    <tr
      className="border-b border-border hover:bg-surface"
      data-application-id={app.id}
      data-testid={app.custom ? "agent-application-custom-row" : undefined}
    >
      <td className="py-3 pl-2 pr-2">
        <button
          type="button"
          className="flex w-full items-center gap-2.5 rounded-md text-left focus-visible:outline-2 focus-visible:outline-ring"
          onClick={() => onAction(app.configured ? "detail" : "attach", app)}
          aria-label={actionLabel(app.configured ? "detail" : "attach")}
          disabled={busy}
        >
          <AppLogo app={app} />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{app.name}</span>
            <span className="block truncate text-ui-sm text-foreground-subtle">
              {[app.vendor, t(`protocol.${app.protocol}`)].filter(Boolean).join(" · ")}
            </span>
          </span>
        </button>
      </td>
      <td className="px-2 py-3">
        <span className="block font-mono text-ui-caption">
          {app.version ?? (app.installed ? t("unknownVersion") : "—")}
        </span>
        {app.installed ? (
          <span className="block text-ui-sm text-foreground-subtle">
            {t(app.attached ? "connected" : "notConnected")}
          </span>
        ) : null}
      </td>
      <td className="px-2 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-mono text-ui-caption">{app.latestVersion ?? "—"}</span>
          {app.updateAvailable ? (
            <Button
              variant="outline"
              size="sm"
              className="h-5 px-1.5 text-ui-sm text-icon-blue"
              disabled={busy}
              aria-label={actionLabel("upgrade")}
              onClick={() => onAction("upgrade", app)}
            >
              {t("upgrade")}
            </Button>
          ) : null}
        </div>
      </td>
      <td className="px-1 py-3 text-center">
        {ready ? (
          <Switch
            checked={app.enabled}
            onCheckedChange={(enabled) => onToggle(app, enabled)}
            disabled={busy}
            aria-label={actionLabel("enabled")}
            className="data-checked:bg-icon-blue data-checked:[&_[data-slot=switch-thumb]]:bg-white"
          />
        ) : (
          <span className="text-foreground-subtle">—</span>
        )}
      </td>
      <td className="px-1 py-3">
        <div className="flex items-center justify-center gap-0.5">
          {ready ? (
            actions.map(({ action, Icon }) => (
              <ControlHintTooltip key={action} title={t(action)}>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  data-action={action}
                  disabled={busy}
                  aria-label={actionLabel(action)}
                  onClick={() => onAction(action, app)}
                >
                  <Icon aria-hidden="true" />
                </Button>
              </ControlHintTooltip>
            ))
          ) : (
            <ControlHintTooltip title={t("attach")}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                data-action="attach"
                disabled={busy}
                aria-label={actionLabel("attach")}
                onClick={() => onAction("attach", app)}
              >
                <Plug aria-hidden="true" />
              </Button>
            </ControlHintTooltip>
          )}
          {app.configured ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  data-action="more"
                  disabled={busy}
                  aria-label={actionLabel("more")}
                  title={t("more")}
                >
                  <Ellipsis aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem data-action="remove" onSelect={() => onAction("remove", app)}>
                  <Plug aria-hidden="true" />
                  {t("remove")}
                </DropdownMenuItem>
                {ready ? (
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => onAction("uninstall", app)}
                  >
                    <Trash2 aria-hidden="true" />
                    {t("uninstall")}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function LoadingRows() {
  const t = useAgentAppText();
  return (
    <tbody data-testid="agent-applications-loading">
      <tr className="border-b border-border bg-hover">
        <td colSpan={5} className="px-2 py-2">
          <p
            role="status"
            className="flex items-center gap-2 text-ui-sm font-medium text-foreground-subtle"
          >
            <RefreshCw
              aria-hidden="true"
              className="size-3.5 shrink-0 text-icon-blue motion-safe:animate-spin"
            />
            {t("loading")}
          </p>
        </td>
      </tr>
      {["w-24", "w-20", "w-28", "w-16"].map((width) => (
        <tr
          key={width}
          aria-hidden="true"
          className="border-b border-border motion-safe:animate-pulse"
        >
          <td className="px-2 py-3">
            <div className="flex items-center gap-2.5">
              <span className="size-9 shrink-0 rounded-lg border border-border bg-surface" />
              <div className="min-w-0 space-y-1.5">
                <div className={`h-2.5 max-w-full rounded-full bg-foreground/10 ${width}`} />
                <div className="h-2 w-14 max-w-full rounded-full bg-foreground/7" />
              </div>
            </div>
          </td>
          <td className="px-2 py-3">
            <div className="space-y-1.5">
              <div className="h-2.5 w-12 rounded-full bg-foreground/10" />
              <div className="h-2 w-8 rounded-full bg-foreground/7" />
            </div>
          </td>
          <td className="px-2 py-3">
            <div className="h-2.5 w-12 rounded-full bg-foreground/10" />
          </td>
          <td className="px-1 py-3">
            <div className="mx-auto flex h-4 w-7 items-center rounded-full bg-foreground/10 px-0.5">
              <span className="size-3 rounded-full bg-foreground/15" />
            </div>
          </td>
          <td className="px-1 py-3">
            <div className="flex justify-center gap-2">
              <span className="size-4 rounded bg-foreground/7" />
              <span className="size-4 rounded bg-foreground/7" />
              <span className="size-4 rounded bg-foreground/7" />
              <span className="size-4 rounded bg-foreground/7" />
            </div>
          </td>
        </tr>
      ))}
    </tbody>
  );
}

export function AgentApplicationsTable({
  apps,
  loading,
  ...props
}: TableProps & { loading: boolean }) {
  const t = useAgentAppText();
  const groups = [
    { name: "installed", rows: apps.filter((item) => item.installed) },
    { name: "uninstalled", rows: apps.filter((item) => !item.installed) },
  ];
  return (
    <div className="min-w-0 overflow-x-auto rounded-xl border border-border">
      <table
        className="w-full min-w-[33rem] table-fixed text-left text-ui-base [&>tbody:last-child>tr:last-child]:border-b-0"
        aria-label={t("title")}
      >
        <colgroup>
          <col className="w-[31%]" />
          <col className="w-[17%]" />
          <col className="w-[21%]" />
          <col className="w-[9%]" />
          <col className="w-[22%]" />
        </colgroup>
        <thead className="border-b border-border bg-surface text-ui-sm text-foreground-subtle">
          <tr>
            <th scope="col" className="px-2 py-2 font-medium">
              {t("application")}
            </th>
            <th scope="col" className="px-2 py-2 font-medium">
              {t("localProgram")}
            </th>
            <th scope="col" className="px-2 py-2 font-medium">
              {t("latestVersion")}
            </th>
            <th scope="col" className="py-2 text-center font-medium">
              {t("enabled")}
            </th>
            <th scope="col" className="py-2 text-center font-medium">
              {t("actions")}
            </th>
          </tr>
        </thead>
        {loading ? (
          <LoadingRows />
        ) : (
          groups
            .filter(({ rows }) => rows.length)
            .map(({ name, rows }) => (
              <tbody key={name} aria-label={t(name)}>
                <tr>
                  <th
                    scope="rowgroup"
                    colSpan={5}
                    className="border-b border-border bg-hover px-2 py-2 text-ui-sm font-medium"
                  >
                    {t(name)}
                  </th>
                </tr>
                {rows.map((app) => (
                  <ApplicationRow key={app.id} app={app} {...props} />
                ))}
              </tbody>
            ))
        )}
      </table>
    </div>
  );
}
