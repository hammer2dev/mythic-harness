import type { AccountEntry, AccountEntryType, AccountField, AccountGroup } from "./contract.js";
import {
  Database,
  Globe,
  KeyRound,
  Server,
  Settings,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { IntlInstance } from "@/i18n/IntlProvider.js";

export const accountTypeIcons = {
  custom: SlidersHorizontal,
  database: Database,
  config: Settings,
  platform: Globe,
  api: KeyRound,
  server: Server,
} satisfies Record<AccountEntryType, LucideIcon>;

const templates: Record<AccountEntryType, Array<[name: string, initial?: string]>> = {
  custom: [[""]],
  database: [["host"], ["port", "3306"], ["database"], ["username"], ["password"]],
  config: [["address"], ["username"], ["password"], ["namespace"]],
  platform: [["loginUrl"], ["username"], ["password"]],
  api: [["apiUrl"], ["appId"], ["appSecret"]],
  server: [["host"], ["port", "22"], ["username"], ["privateKey"]],
};

export function getAccountTemplate(type: AccountEntryType, intl: IntlInstance): AccountField[] {
  return templates[type].map(([name, initial = ""]) => ({
    name: name ? intl.formatMessage({ id: "accountManagement.field." + name }) : "",
    value: initial,
  }));
}

export function accountTypeName(type: AccountEntryType, intl: IntlInstance) {
  return intl.formatMessage({ id: "accountManagement.type." + type });
}

export function entryClipboardText(entry: AccountEntry, intl: IntlInstance) {
  return [
    entry.name,
    intl.formatMessage(
      { id: "accountManagement.copyType" },
      { type: accountTypeName(entry.type, intl) },
    ),
    entry.description,
    ...entry.fields.map(({ name, value }) => name + ": " + value),
  ]
    .filter(Boolean)
    .join("\n");
}

export function groupClipboardText(group: AccountGroup, intl: IntlInstance) {
  return [
    group.name,
    group.description,
    ...group.entries.map((entry) => entryClipboardText(entry, intl)),
  ]
    .filter(Boolean)
    .join("\n\n");
}
