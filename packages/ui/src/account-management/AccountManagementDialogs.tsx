import { useId, useState, type FormEvent, type ReactNode } from "react";
import type {
  AccountEntry,
  AccountEntryInput,
  AccountGroup,
  AccountGroupInput,
} from "./contract.js";
import { Copy, Pencil } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { Input } from "@/components/ui/input.js";
import { Textarea } from "@/components/ui/textarea.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { AccountEntryEditor } from "./AccountEntryEditor.js";
import { accountTypeName, entryClipboardText } from "./accountTemplates.js";

export type AccountDialog =
  | { kind: "group"; groupId?: string }
  | { kind: "entry"; groupId: string; entryId?: string; fromDetail?: boolean }
  | { kind: "detail"; groupId: string; entryId: string }
  | { kind: "remove"; groupId: string; entryId?: string }
  | { kind: "copy"; text: string; previous: AccountDialog | null };

function GroupEditor({
  formId,
  group,
  onSave,
}: {
  formId: string;
  group?: AccountGroup;
  onSave(input: AccountGroupInput): void;
}) {
  const { intl } = useZCodeIntl();
  const [invalidName, setInvalidName] = useState(false);
  const message = (id: string) => intl.formatMessage({ id: "accountManagement." + id });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get("name") ?? "").trim();
    if (!name) {
      setInvalidName(true);
      event.currentTarget.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
      return;
    }
    onSave({ name, description: String(data.get("description") ?? "").trim() });
  }

  return (
    <form id={formId} noValidate onSubmit={submit} className="grid gap-4">
      <label className="grid gap-1.5 text-ui-caption font-medium">
        {message("groupName")}
        <Input
          name="name"
          required
          aria-invalid={invalidName}
          onChange={() => setInvalidName(false)}
          defaultValue={group?.name}
        />
      </label>
      <label className="grid gap-1.5 text-ui-caption font-medium">
        {message("description")}
        {/* 基础 Textarea 的边框色接近弹窗底色，表单改用专门的输入框边框色。 */}
        <SettingsFormTextarea name="description" defaultValue={group?.description} rows={2} />
      </label>
      {invalidName ? (
        <p role="alert" className="text-ui-caption text-destructive">
          {message("groupNameRequired")}
        </p>
      ) : null}
    </form>
  );
}

function EntryDetails({ entry, onCopy }: { entry: AccountEntry; onCopy(text: string): void }) {
  const { intl } = useZCodeIntl();
  return (
    <>
      {entry.description ? (
        <p className="mb-4 whitespace-pre-wrap break-words text-ui-caption text-foreground-subtle">
          {entry.description}
        </p>
      ) : null}
      <h3 className="border-b border-border pb-2 text-ui-base font-medium">
        {intl.formatMessage({ id: "accountManagement.fields" })}
      </h3>
      <dl>
        {entry.fields.map(({ name, value }) => {
          const label = intl.formatMessage({ id: "accountManagement.copyField" }, { name });
          return (
            <div
              key={name}
              className="grid grid-cols-[minmax(4rem,1fr)_minmax(0,3fr)_auto] items-start gap-2 border-b border-border py-2"
            >
              <dt className="break-words py-1 text-ui-caption text-foreground-subtle">{name}</dt>
              <dd className="min-w-0 whitespace-pre-wrap rounded-md bg-surface px-2 py-1 font-mono text-ui-caption [overflow-wrap:anywhere]">
                {value || "—"}
              </dd>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={label}
                title={label}
                onClick={() => onCopy(value)}
              >
                <Copy className="size-4" aria-hidden="true" />
              </Button>
            </div>
          );
        })}
      </dl>
    </>
  );
}

export function AccountManagementDialogs({
  state,
  group,
  entry,
  saving,
  saveFailed,
  onClose,
  onSaveGroup,
  onSaveEntry,
  onDelete,
  onEditEntry,
  onCopy,
}: {
  state: AccountDialog;
  group?: AccountGroup;
  entry?: AccountEntry;
  saving: boolean;
  saveFailed: boolean;
  onClose(): void;
  onSaveGroup(input: AccountGroupInput): void;
  onSaveEntry(input: AccountEntryInput): void;
  onDelete(): void;
  onEditEntry(): void;
  onCopy(text: string): void;
}) {
  const { intl } = useZCodeIntl();
  const formId = useId();
  const message = (id: string) => intl.formatMessage({ id: "accountManagement." + id });
  let title: string;
  let description: string | undefined;
  let content: ReactNode;
  let actions: ReactNode;
  const drawer = state.kind === "detail";
  const scrollBody = drawer || state.kind === "entry";

  switch (state.kind) {
    case "group":
      title = message(group ? "editGroup" : "newGroup");
      content = <GroupEditor formId={formId} group={group} onSave={onSaveGroup} />;
      actions = (
        <Button type="submit" form={formId} disabled={saving}>
          {message(group ? "saveChanges" : "createGroup")}
        </Button>
      );
      break;
    case "entry":
      title = message(entry ? "editEntry" : "newEntry");
      description = group?.name;
      content = <AccountEntryEditor formId={formId} entry={entry} onSave={onSaveEntry} />;
      actions = (
        <Button type="submit" form={formId} disabled={saving}>
          {message("saveEntry")}
        </Button>
      );
      break;
    case "detail":
      if (!entry || !group) return null;
      title = entry.name;
      description = group.name + " · " + accountTypeName(entry.type, intl);
      content = <EntryDetails entry={entry} onCopy={onCopy} />;
      actions = (
        <>
          <Button
            type="button"
            variant="outline"
            onClick={() => onCopy(entryClipboardText(entry, intl))}
          >
            <Copy className="size-4" aria-hidden="true" />
            {message("copyEntry")}
          </Button>
          <Button type="button" onClick={onEditEntry}>
            <Pencil className="size-4" aria-hidden="true" />
            {message("editEntry")}
          </Button>
        </>
      );
      break;
    case "remove":
      if (!group) return null;
      title = message(entry ? "deleteEntry" : "deleteGroup");
      description = intl.formatMessage(
        {
          id: entry
            ? "accountManagement.deleteEntryDescription"
            : "accountManagement.deleteGroupDescription",
        },
        { name: entry?.name ?? group.name, count: group.entries.length },
      );
      actions = (
        <Button type="button" variant="destructive" disabled={saving} onClick={onDelete}>
          {message("confirmDelete")}
        </Button>
      );
      break;
    case "copy":
      title = message("manualCopy");
      description = message("manualCopyDescription");
      content = (
        <Textarea
          className="max-h-56 min-h-24 font-mono"
          aria-label={title}
          readOnly
          value={state.text}
          onFocus={(event) => event.currentTarget.select()}
        />
      );
      break;
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <DialogContent
        className={cn(
          scrollBody ? "flex flex-col gap-0 overflow-clip p-0" : "max-w-md overflow-y-auto",
          drawer
            ? "top-0 right-0 bottom-0 left-auto h-dvh max-w-lg translate-x-0 translate-y-0 rounded-none border-y-0 border-r-0 data-open:zoom-in-100 data-closed:zoom-out-100"
            : "max-h-[calc(100dvh-2rem)]",
          state.kind === "entry" && "sm:max-w-lg",
        )}
        {...(description ? {} : { "aria-describedby": undefined })}
      >
        <DialogHeader
          className={scrollBody ? "shrink-0 border-b border-border px-5 py-4 pr-12" : "pr-8"}
        >
          <DialogTitle className="break-words text-ui-lg font-semibold">{title}</DialogTitle>
          {description ? (
            <DialogDescription className="break-words">{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {content ? (
          <div className={scrollBody ? "min-h-0 flex-1 overflow-y-auto px-5 py-4" : "min-w-0"}>
            {content}
          </div>
        ) : null}
        {saveFailed ? (
          <p role="alert" className="px-4 text-ui-caption text-destructive">
            {message("writeFailed")}
          </p>
        ) : null}
        <DialogFooter
          className={scrollBody ? "shrink-0 border-t border-border px-5 py-3" : undefined}
        >
          {state.kind !== "detail" ? (
            <Button type="button" variant="outline" disabled={saving} onClick={onClose}>
              {intl.formatMessage({ id: state.kind === "copy" ? "common.close" : "common.cancel" })}
            </Button>
          ) : null}
          {actions}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
