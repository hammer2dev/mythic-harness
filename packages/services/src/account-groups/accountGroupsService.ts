import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { CredentialCipher } from "@zcode/shared/credential-security";
import {
  atomicWritePrivateTextFile,
  withCredentialFileMutation,
  withCredentialFileRead,
  withCredentialGeneration,
  withFileLock,
} from "@zcode/shared/node";
import { z } from "zod";
import {
  ACCOUNT_ENTRY_TYPES,
  DEFAULT_ACCOUNT_GROUP_ID,
  type AccountGroup,
  type IAccountGroupsService,
} from "./contract.js";

const idSchema = z.string().uuid();
const groupInput = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim(),
});
const fieldSchema = z.object({ name: z.string().trim().min(1), value: z.string() });
const entryInput = groupInput.extend({
  type: z.enum(ACCOUNT_ENTRY_TYPES),
  fields: z
    .array(fieldSchema)
    .min(1)
    .refine((fields) => {
      return new Set(fields.map(({ name }) => name)).size === fields.length;
    }),
});
const entryTarget = z.object({ groupId: idSchema, entryId: idSchema });
const saveGroupInput = groupInput.extend({ id: idSchema.optional() });
const saveEntryInput = entryInput.extend({ groupId: idSchema, entryId: idSchema.optional() });
const fileSchema = z.object({
  version: z.literal(1),
  groups: z.array(
    groupInput.extend({ id: idSchema, entries: z.array(entryInput.extend({ id: idSchema })) }),
  ),
});

function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error("account-groups.invalid-input");
  return parsed.data;
}

function includeDefaultGroup(groups: AccountGroup[]): AccountGroup[] {
  const existing = groups.find(({ id }) => id === DEFAULT_ACCOUNT_GROUP_ID);
  const defaultGroup = existing ?? {
    id: DEFAULT_ACCOUNT_GROUP_ID,
    name: "Default group",
    description: "",
    entries: [],
  };
  return [defaultGroup, ...groups.filter(({ id }) => id !== DEFAULT_ACCOUNT_GROUP_ID)];
}

function requireGroup(groups: AccountGroup[], id: string): AccountGroup {
  const group = groups.find((candidate) => candidate.id === id);
  if (!group) throw new Error("account-groups.group-not-found");
  return group;
}

function requireEntryIndex(group: AccountGroup, id: string): number {
  const index = group.entries.findIndex((entry) => entry.id === id);
  if (index < 0) throw new Error("account-groups.entry-not-found");
  return index;
}

export function createAccountGroupsService({
  paths,
  cipher,
}: {
  paths(): { filePath: string; credentialsFilePath: string };
  cipher: CredentialCipher;
}): IAccountGroupsService {
  async function readGroups(filePath: string): Promise<AccountGroup[]> {
    let ciphertext: string;
    try {
      ciphertext = await readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return includeDefaultGroup([]);
      throw error;
    }
    try {
      const value: unknown = JSON.parse(await cipher.decrypt(ciphertext.trim()));
      return includeDefaultGroup(fileSchema.parse(value).groups);
    } catch {
      // 凭据桥的错误和资料解析错误都转为固定消息，避免内容出现在 RPC 日志。
      throw new Error("account-groups.unreadable");
    }
  }

  function update<T>(mutate: (groups: AccountGroup[]) => T): Promise<T> {
    const { filePath, credentialsFilePath } = paths();
    return withCredentialGeneration(credentialsFilePath, () =>
      withFileLock(filePath, async () => {
        const groups = await readGroups(filePath);
        const result = mutate(groups);
        const ciphertext = await cipher.encrypt(JSON.stringify({ version: 1, groups }));
        await withCredentialFileMutation(credentialsFilePath, () =>
          atomicWritePrivateTextFile(filePath, ciphertext + "\n"),
        );
        return result;
      }),
    );
  }

  return {
    listGroups() {
      const { filePath, credentialsFilePath } = paths();
      return withCredentialFileRead(credentialsFilePath, () => readGroups(filePath));
    },
    async saveGroup(input) {
      const { id, ...data } = parseInput(saveGroupInput, input);
      if (id === DEFAULT_ACCOUNT_GROUP_ID) throw new Error("account-groups.fixed-group");
      return update((groups) => {
        if (id) {
          Object.assign(requireGroup(groups, id), data);
          return { id, groups };
        }
        const newId = randomUUID();
        groups.push({ ...data, id: newId, entries: [] });
        return { id: newId, groups };
      });
    },
    async deleteGroup(input) {
      const id = parseInput(idSchema, input);
      if (id === DEFAULT_ACCOUNT_GROUP_ID) throw new Error("account-groups.fixed-group");
      return update((groups) => {
        const group = requireGroup(groups, id);
        groups.splice(groups.indexOf(group), 1);
        return groups;
      });
    },
    async saveEntry(input) {
      const { groupId, entryId, ...data } = parseInput(saveEntryInput, input);
      return update((groups) => {
        const group = requireGroup(groups, groupId);
        if (entryId) {
          group.entries[requireEntryIndex(group, entryId)] = { ...data, id: entryId };
        } else {
          group.entries.push({ ...data, id: randomUUID() });
        }
        return groups;
      });
    },
    async deleteEntry(input) {
      const { groupId, entryId } = parseInput(entryTarget, input);
      return update((groups) => {
        const group = requireGroup(groups, groupId);
        group.entries.splice(requireEntryIndex(group, entryId), 1);
        return groups;
      });
    },
  };
}
