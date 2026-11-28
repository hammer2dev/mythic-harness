import { ServiceChannels } from "@zcode/shared";
import { createServiceDescriptor } from "../descriptors.js";

export const DEFAULT_ACCOUNT_GROUP_ID = "00000000-0000-5000-8000-000000000001";

export const ACCOUNT_ENTRY_TYPES = [
  "custom",
  "database",
  "config",
  "platform",
  "api",
  "server",
] as const;
export type AccountEntryType = (typeof ACCOUNT_ENTRY_TYPES)[number];

export interface AccountField {
  name: string;
  value: string;
}

export interface AccountEntryInput {
  name: string;
  description: string;
  type: AccountEntryType;
  fields: AccountField[];
}

export interface AccountEntry extends AccountEntryInput {
  id: string;
}

export interface AccountGroupInput {
  name: string;
  description: string;
}

export interface AccountGroup extends AccountGroupInput {
  id: string;
  entries: AccountEntry[];
}

export interface AccountEntryTarget {
  groupId: string;
  entryId: string;
}

export interface IAccountGroupsService {
  listGroups(): Promise<AccountGroup[]>;
  saveGroup(
    input: AccountGroupInput & { id?: string },
  ): Promise<{ id: string; groups: AccountGroup[] }>;
  deleteGroup(id: string): Promise<AccountGroup[]>;
  saveEntry(
    input: AccountEntryInput & { groupId: string; entryId?: string },
  ): Promise<AccountGroup[]>;
  deleteEntry(target: AccountEntryTarget): Promise<AccountGroup[]>;
}

export const IAccountGroupsService = createServiceDescriptor<IAccountGroupsService>(
  ServiceChannels.AccountGroups,
);
