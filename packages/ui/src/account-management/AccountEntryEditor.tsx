import { useState, type FormEvent } from "react";
import {
  ACCOUNT_ENTRY_TYPES,
  type AccountEntry,
  type AccountEntryInput,
  type AccountEntryType,
  type AccountField,
} from "./contract.js";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { SettingsFormTextarea } from "@/settings/SettingsFormTextarea.js";
import { accountTypeName, getAccountTemplate } from "./accountTemplates.js";

const selectClassName =
  "h-9 w-full min-w-0 rounded-lg border border-input-border bg-input px-2 text-ui-base hover:border-input-border-hover focus-visible:border-input-border-focused";

function editableField(field: AccountField) {
  return { ...field, key: crypto.randomUUID() };
}

export function AccountEntryEditor({
  formId,
  entry,
  onSave,
}: {
  formId: string;
  entry?: AccountEntry;
  onSave(input: AccountEntryInput): void;
}) {
  const { intl } = useZCodeIntl();
  const message = (id: string) => intl.formatMessage({ id: "accountManagement." + id });
  const [type, setType] = useState(entry?.type ?? "custom");
  const [fields, setFields] = useState(() =>
    (entry?.fields ?? getAccountTemplate("custom", intl)).map(editableField),
  );
  const [error, setError] = useState("");

  function changeType(next: AccountEntryType) {
    setType(next);
    if (entry) return;
    const previous = new Map(fields.map(({ name, value }) => [name, value]));
    setFields(
      getAccountTemplate(next, intl).map((field) =>
        editableField({ ...field, value: previous.get(field.name) ?? field.value }),
      ),
    );
  }

  function changeField(key: string, property: keyof AccountField, value: string) {
    setFields((current) =>
      current.map((field) => (field.key === key ? { ...field, [property]: value } : field)),
    );
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const description = String(form.get("description") ?? "").trim();
    const submittedFields = fields.map(({ name, value }) => ({ name: name.trim(), value }));
    if (!name) {
      setError("entryNameRequired");
      event.currentTarget.querySelector<HTMLInputElement>('input[name="name"]')?.focus();
      return;
    }
    if (!submittedFields.length || submittedFields.some((field) => !field.name)) {
      setError("fieldNameRequired");
      return;
    }
    if (new Set(submittedFields.map((field) => field.name)).size !== submittedFields.length) {
      setError("duplicateFieldName");
      return;
    }
    setError("");
    onSave({ name, description, type, fields: submittedFields });
  }

  return (
    <form id={formId} noValidate onSubmit={submit} className="grid min-w-0 gap-4">
      <div className="grid grid-cols-[minmax(0,2fr)_minmax(7rem,1fr)] gap-3">
        <label className="grid min-w-0 gap-1.5 text-ui-caption font-medium">
          {message("entryName")}
          <Input name="name" defaultValue={entry?.name} required />
        </label>
        <label className="grid min-w-0 gap-1.5 text-ui-caption font-medium">
          {message(entry ? "type" : "template")}
          <select
            name="type"
            className={selectClassName}
            value={type}
            onChange={(event) => changeType(event.currentTarget.value as AccountEntryType)}
          >
            {ACCOUNT_ENTRY_TYPES.map((item) => (
              <option key={item} value={item}>
                {accountTypeName(item, intl)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="grid gap-1.5 text-ui-caption font-medium">
        {message("description")}
        <SettingsFormTextarea name="description" defaultValue={entry?.description} rows={2} />
      </label>
      <div className="grid gap-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-ui-base font-medium">{message("fields")}</h3>
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              setFields((current) => [...current, editableField({ name: "", value: "" })])
            }
          >
            <Plus className="size-4" aria-hidden="true" />
            {message("addField")}
          </Button>
        </div>
        {fields.map((field, index) => {
          const number = index + 1;
          const label = (id: string) =>
            intl.formatMessage({ id: "accountManagement." + id }, { number });
          return (
            <div
              key={field.key}
              className="grid min-w-0 grid-cols-[minmax(5rem,1fr)_minmax(0,2fr)_auto] items-start gap-2"
            >
              <Input
                size="lg"
                className="py-1 leading-5"
                aria-label={label("fieldNameLabel")}
                placeholder={message("fieldName")}
                value={field.name}
                onChange={(event) => changeField(field.key, "name", event.currentTarget.value)}
              />
              {/* 基础 Textarea 的边框接近弹窗底色，字段值复用设置表单样式并对齐单行输入框。 */}
              <SettingsFormTextarea
                rows={1}
                className="max-h-36 min-h-8 min-w-0 px-3 py-1 font-mono leading-5 md:leading-5"
                aria-label={label("fieldValueLabel")}
                placeholder={message("fieldValue")}
                value={field.value}
                onChange={(event) => changeField(field.key, "value", event.currentTarget.value)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                aria-label={label("removeField")}
                title={label("removeField")}
                onClick={() =>
                  setFields((current) => current.filter(({ key }) => key !== field.key))
                }
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </div>
          );
        })}
        {error ? (
          <p role="alert" className="text-ui-caption text-destructive">
            {message(error)}
          </p>
        ) : null}
      </div>
    </form>
  );
}
