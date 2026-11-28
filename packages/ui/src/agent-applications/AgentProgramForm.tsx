import { useState, type FormEvent } from "react";
import { FolderOpen } from "lucide-react";
import type {
  AgentApplicationProgramInput,
  AgentApplicationView,
} from "@zcode/shared/agent-applications";
import { Button } from "@/components/ui/button.js";
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { usePlatform } from "@/hooks/usePlatform.js";
import { useAgentAppText } from "./text.js";

export const AGENT_SELECT_CLASS =
  "h-9 w-full rounded-md border border-input-border bg-input px-2 text-ui-base focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60";

export function AgentProgramForm({
  app,
  apps,
  editing,
  busy,
  onSave,
  onClose,
}: {
  app?: AgentApplicationView;
  apps: readonly AgentApplicationView[];
  editing: boolean;
  busy: boolean;
  onSave(input: AgentApplicationProgramInput): Promise<void>;
  onClose(): void;
}) {
  const t = useAgentAppText();
  const platform = usePlatform();
  const [type, setType] = useState(app?.id ?? "custom");
  const [name, setName] = useState(app?.name ?? "");
  const [path, setPath] = useState(app?.path ?? "");
  const [args, setArgs] = useState(app?.args.join("\n") ?? "");
  const [pickerError, setPickerError] = useState(false);
  const custom = type === "custom" || apps.some((item) => item.id === type && item.custom);

  async function pickPath() {
    setPickerError(false);
    try {
      const file = await platform.selectFile();
      if (file) setPath(file);
    } catch {
      setPickerError(true);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await onSave({
      ...(type === "custom" ? {} : { id: type }),
      path: path.trim(),
      ...(custom
        ? { name: name.trim(), args: args.split(/\r?\n/).filter((line) => line.trim()) }
        : {}),
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t(editing ? "edit" : "attach")}</DialogTitle>
        <DialogDescription>{app?.name ?? t("chooseProgram")}</DialogDescription>
      </DialogHeader>
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        {!editing ? (
          <label className="grid gap-1.5">
            {t("appType")}
            <select
              className={AGENT_SELECT_CLASS}
              disabled={busy}
              value={type}
              onChange={(event) => {
                setType(event.target.value);
                setPath(apps.find((item) => item.id === event.target.value)?.path ?? "");
              }}
            >
              <option value="custom">{t("custom")}</option>
              {apps
                .filter(
                  (item) =>
                    item.id === app?.id || (!item.custom && (!item.attached || !item.installed)),
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
        ) : null}
        {custom ? (
          <label className="grid gap-1.5">
            {t("appName")}
            <Input
              name="agent-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoComplete="off"
              required
              maxLength={40}
              disabled={busy}
            />
          </label>
        ) : null}
        <div className="grid gap-1.5">
          <label htmlFor="agent-application-path">{t("path")}</label>
          <div className="flex items-center gap-2">
            <Input
              id="agent-application-path"
              name="agent-path"
              className="font-mono"
              value={path}
              onChange={(event) => setPath(event.target.value)}
              autoComplete="off"
              required
              disabled={busy}
            />
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={() => void pickPath()}
              disabled={busy}
            >
              <FolderOpen aria-hidden="true" />
              {t("browse")}
            </Button>
          </div>
          {pickerError ? (
            <p role="alert" className="text-ui-sm text-destructive">
              {t("error.path")}
            </p>
          ) : null}
        </div>
        {custom ? (
          <label className="grid gap-1.5">
            {t("args")}
            {/* 通用多行框的边框在深色弹窗下不明显，沿用表单输入框的边框色。 */}
            <Textarea
              name="agent-args"
              value={args}
              onChange={(event) => setArgs(event.target.value)}
              className="max-h-40 min-h-18 border-input-border bg-input font-mono placeholder:text-foreground-subtle hover:border-input-border-hover focus-visible:border-input-border-focused focus-visible:bg-input-focused focus-visible:ring-0"
              placeholder={t("argsHint")}
              disabled={busy}
            />
          </label>
        ) : null}
        <DialogFooter className="flex-row flex-wrap justify-end border-t border-border pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t("cancel")}
          </Button>
          <Button
            type="submit"
            disabled={busy || !path.trim() || (custom && !name.trim())}
            data-testid="agent-application-save"
          >
            {t(editing ? "save" : "connect")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
