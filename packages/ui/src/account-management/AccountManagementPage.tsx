import { useState, type ReactNode } from "react";
import {
  ACCOUNT_ENTRY_TYPES,
  ACCOUNT_MANAGEMENT_PAGE_TEST_ID,
  DEFAULT_ACCOUNT_GROUP_ID,
  type AccountEntryInput,
  type AccountGroupInput,
} from "./contract.js";
import {
  Copy,
  Ellipsis,
  Folder,
  FolderOpen,
  Pencil,
  Plus,
  Search,
  SquarePen,
  Trash2,
} from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.js";
import { Input } from "@/components/ui/input.js";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { toast } from "@/components/ui/toast.js";
import { useAccountGroups } from "@/hooks/useAccountGroups.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  WORKSPACE_PAGE_CONTENT_CLASSNAME,
  WorkspacePageHeader,
} from "@/settings/SettingsPageParts.js";
import { AccountManagementDialogs, type AccountDialog } from "./AccountManagementDialogs.js";
import {
  accountTypeIcons,
  accountTypeName,
  entryClipboardText,
  groupClipboardText,
} from "./accountTemplates.js";

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

export function AccountManagementPage() {
  const { intl } = useZCodeIntl();
  const accounts = useAccountGroups();
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [dialog, setDialog] = useState<AccountDialog | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const t = (id: string, values?: { name: string }) =>
    intl.formatMessage({ id: "accountManagement." + id }, values);

  const groups =
    accounts.state.status === "ready"
      ? accounts.state.groups.map((group) =>
          group.id === DEFAULT_ACCOUNT_GROUP_ID ? { ...group, name: t("defaultGroup") } : group,
        )
      : [];
  const activeGroup = groups.find(({ id }) => id === activeGroupId) ?? groups[0];
  const dialogGroupId = dialog && "groupId" in dialog ? dialog.groupId : undefined;
  const dialogEntryId = dialog && "entryId" in dialog ? dialog.entryId : undefined;
  const dialogGroup = groups.find(({ id }) => id === dialogGroupId);
  const dialogEntry = dialogGroup?.entries.find(({ id }) => id === dialogEntryId);
  const query = search.trim().toLowerCase();
  const hasEntries = Boolean(activeGroup?.entries.length);
  const entries = (activeGroup?.entries ?? []).filter(
    (entry) =>
      (type === "all" || entry.type === type) &&
      [entry.name, entry.description, ...entry.fields.flatMap(({ name, value }) => [name, value])]
        .join("\n")
        .toLowerCase()
        .includes(query),
  );

  function clearFilters() {
    setSearch("");
    setType("all");
  }

  function selectGroup(id: string) {
    setActiveGroupId(id);
    clearFilters();
  }

  function showDialog(next: AccountDialog | null) {
    setSaveFailed(false);
    setDialog(next);
  }

  function closeDialog() {
    if (dialog?.kind === "entry" && dialog.fromDetail && dialog.entryId) {
      showDialog({ kind: "detail", groupId: dialog.groupId, entryId: dialog.entryId });
    } else {
      showDialog(dialog?.kind === "copy" ? dialog.previous : null);
    }
  }

  async function commit(write: () => Promise<void>, success: () => void = closeDialog) {
    if (saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      await write();
      success();
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  }

  function saveGroup(input: AccountGroupInput) {
    void commit(async () => {
      const id = await accounts.saveGroup({
        ...input,
        ...(dialogGroupId ? { id: dialogGroupId } : {}),
      });
      if (!dialogGroupId) selectGroup(id);
    });
  }

  function saveEntry(input: AccountEntryInput) {
    const groupId = dialogGroupId;
    if (!groupId) return;
    void commit(async () => {
      await accounts.saveEntry({
        ...input,
        groupId,
        ...(dialogEntryId ? { entryId: dialogEntryId } : {}),
      });
      if (!dialogEntryId) clearFilters();
    });
  }

  function remove() {
    const groupId = dialogGroupId;
    if (!groupId) return;
    void commit(async () => {
      if (dialogEntryId) {
        await accounts.deleteEntry({ groupId, entryId: dialogEntryId });
      } else {
        await accounts.deleteGroup(groupId);
        if (activeGroup?.id === groupId) {
          setActiveGroupId(null);
          clearFilters();
        }
      }
    });
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast(t("copied"));
    } catch {
      showDialog({ kind: "copy", text, previous: dialog });
    }
  }

  return (
    <div
      className={cn(WORKSPACE_PAGE_CONTENT_CLASSNAME, "max-w-6xl")}
      data-workspace-page-content="true"
      data-testid={ACCOUNT_MANAGEMENT_PAGE_TEST_ID}
    >
      <WorkspacePageHeader title={t("title")} />
      {accounts.state.status === "loading" ? (
        <p role="status" className="mt-6 text-ui-caption text-foreground-subtle">
          {t("loading")}
        </p>
      ) : accounts.state.status === "error" ? (
        <div className="mt-6 flex items-center gap-3">
          <p role="alert" className="text-ui-caption text-destructive">
            {t("loadFailed")}
          </p>
          <Button type="button" variant="outline" onClick={accounts.retry}>
            {t("retry")}
          </Button>
        </div>
      ) : (
        <div className="@container/accounts mt-5 border-t border-border">
          <div className="grid min-w-0 @min-[42rem]/accounts:grid-cols-[11rem_minmax(0,1fr)]">
            <section
              className="min-w-0 border-b border-border py-4 @min-[42rem]/accounts:border-r @min-[42rem]/accounts:border-b-0 @min-[42rem]/accounts:pr-3"
              aria-label={t("groups")}
            >
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <h2 className="text-ui-base font-medium">{t("groups")}</h2>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  aria-label={t("newGroup")}
                  title={t("newGroup")}
                  data-testid="account-group-add"
                  onClick={() => showDialog({ kind: "group" })}
                >
                  <SquarePen aria-hidden="true" />
                </Button>
              </div>
              <ul className="flex flex-wrap gap-1 @min-[42rem]/accounts:flex-col">
                {groups.map((group) => {
                  const active = activeGroup?.id === group.id;
                  const Icon = active ? FolderOpen : Folder;
                  const label = t("groupActions", { name: group.name });
                  return (
                    <li
                      key={group.id}
                      className={cn(
                        "flex max-w-full items-center gap-0.5 rounded-md pr-1",
                        active ? "bg-selected" : "hover:bg-surface",
                      )}
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        className="min-w-0 flex-1 justify-start px-2"
                        aria-current={active || undefined}
                        title={group.name}
                        onClick={() => selectGroup(group.id)}
                      >
                        <Icon
                          className="size-4 shrink-0 text-foreground-subtle"
                          aria-hidden="true"
                        />
                        <span className="truncate">{group.name}</span>
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={label}
                            title={label}
                          >
                            <Ellipsis className="size-4" aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => void copy(groupClipboardText(group, intl))}
                          >
                            <Copy aria-hidden="true" />
                            {t("copyGroup")}
                          </DropdownMenuItem>
                          {group.id !== DEFAULT_ACCOUNT_GROUP_ID ? (
                            <>
                              <DropdownMenuItem
                                onSelect={() => showDialog({ kind: "group", groupId: group.id })}
                              >
                                <Pencil aria-hidden="true" />
                                {t("editGroup")}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                variant="destructive"
                                data-testid="account-group-delete"
                                onSelect={() => showDialog({ kind: "remove", groupId: group.id })}
                              >
                                <Trash2 aria-hidden="true" />
                                {t("deleteGroup")}
                              </DropdownMenuItem>
                            </>
                          ) : null}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </li>
                  );
                })}
              </ul>
            </section>

            <section
              className="min-w-0 py-4 @min-[42rem]/accounts:pl-4"
              aria-label={activeGroup?.name ?? t("entries")}
            >
              <header className="mb-3 flex flex-wrap items-start gap-2">
                <div className="min-w-0 grow basis-20">
                  <h2
                    className="h-8 truncate text-ui-xl leading-8 font-semibold"
                    title={activeGroup?.name}
                  >
                    {activeGroup?.name ?? t("entries")}
                  </h2>
                  {activeGroup?.description ? (
                    <p className="mt-1 whitespace-pre-wrap break-words text-ui-caption text-foreground-subtle">
                      {activeGroup.description}
                    </p>
                  ) : null}
                </div>
                <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-2">
                  <div className="flex min-w-0 max-w-full items-center gap-2">
                    <div className="relative w-40 min-w-0">
                      <Search
                        className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-foreground-subtle"
                        aria-hidden="true"
                      />
                      <Input
                        type="search"
                        size="lg"
                        className="pl-8"
                        aria-label={t("search")}
                        placeholder={t("search")}
                        value={search}
                        onChange={(event) => setSearch(event.currentTarget.value)}
                      />
                    </div>
                    <Select value={type} onValueChange={setType}>
                      <SelectTrigger
                        size="lg"
                        className="w-28 shrink-0"
                        aria-label={t("typeFilter")}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent position="popper" align="end">
                        <SelectItem value="all">{t("allTypes")}</SelectItem>
                        {ACCOUNT_ENTRY_TYPES.map((item) => (
                          <SelectItem key={item} value={item}>
                            {accountTypeName(item, intl)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {activeGroup ? (
                    <Button
                      type="button"
                      size="lg"
                      data-testid="account-entry-add"
                      onClick={() => showDialog({ kind: "entry", groupId: activeGroup.id })}
                    >
                      <Plus className="size-4" aria-hidden="true" />
                      {t("newEntry")}
                    </Button>
                  ) : null}
                </div>
              </header>
              <div
                className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-ring"
                role="region"
                tabIndex={0}
                aria-label={t("entries")}
              >
                <table className="w-full min-w-105 table-fixed border-collapse text-left">
                  <colgroup>
                    <col className="w-1/3" />
                    <col />
                    <col className="w-24" />
                    <col className="w-24" />
                  </colgroup>
                  <thead className="border-y border-border bg-surface text-ui-caption text-foreground-subtle">
                    <tr>
                      <th scope="col" className="px-2 py-2 font-medium">
                        {t("name")}
                      </th>
                      <th scope="col" className="px-2 py-2 font-medium">
                        {t("description")}
                      </th>
                      <th scope="col" className="px-2 py-2 font-medium">
                        {t("type")}
                      </th>
                      <th scope="col" className="px-2 py-2 text-center font-medium">
                        {t("actions")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {activeGroup && entries.length ? (
                      entries.map((entry) => {
                        const target = { groupId: activeGroup.id, entryId: entry.id };
                        const Icon = accountTypeIcons[entry.type];
                        return (
                          <tr key={entry.id} className="border-b border-border hover:bg-surface">
                            <td className="p-2">
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-auto w-full justify-start px-1 py-1.5"
                                onClick={() => showDialog({ kind: "detail", ...target })}
                              >
                                <Icon
                                  className="size-4 shrink-0 text-icon-blue"
                                  aria-hidden="true"
                                />
                                <span className="text-left whitespace-normal [overflow-wrap:anywhere]">
                                  {entry.name}
                                </span>
                              </Button>
                            </td>
                            <td className="p-2 text-ui-caption whitespace-pre-wrap text-foreground-subtle [overflow-wrap:anywhere]">
                              {entry.description || "—"}
                            </td>
                            <td className="p-2 text-ui-caption">
                              {accountTypeName(entry.type, intl)}
                            </td>
                            <td className="py-2 text-center">
                              <div className="inline-flex items-center gap-1 align-middle">
                                <IconAction
                                  label={t("copyNamed", { name: entry.name })}
                                  onClick={() => void copy(entryClipboardText(entry, intl))}
                                >
                                  <Copy aria-hidden="true" />
                                </IconAction>
                                <IconAction
                                  label={t("editNamed", { name: entry.name })}
                                  onClick={() => showDialog({ kind: "entry", ...target })}
                                >
                                  <Pencil aria-hidden="true" />
                                </IconAction>
                                <IconAction
                                  label={t("deleteNamed", { name: entry.name })}
                                  onClick={() => showDialog({ kind: "remove", ...target })}
                                >
                                  <Trash2 aria-hidden="true" />
                                </IconAction>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr className="border-b border-border">
                        <td
                          colSpan={4}
                          className="px-2 py-6 text-center text-ui-caption text-foreground-subtle"
                        >
                          <p role="status">{t(hasEntries ? "noResults" : "noEntries")}</p>
                          {hasEntries ? (
                            <Button
                              type="button"
                              variant="ghost"
                              className="mt-2"
                              onClick={clearFilters}
                            >
                              {t("clearFilters")}
                            </Button>
                          ) : null}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </div>
      )}
      {dialog ? (
        <AccountManagementDialogs
          state={dialog}
          group={dialogGroup}
          entry={dialogEntry}
          saving={saving}
          saveFailed={saveFailed}
          onClose={closeDialog}
          onSaveGroup={saveGroup}
          onSaveEntry={saveEntry}
          onDelete={remove}
          onEditEntry={() => {
            if (dialog.kind === "detail")
              showDialog({ ...dialog, kind: "entry", fromDetail: true });
          }}
          onCopy={(text) => void copy(text)}
        />
      ) : null}
    </div>
  );
}
