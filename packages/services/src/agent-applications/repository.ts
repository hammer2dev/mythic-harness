import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { atomicWritePrivateTextFile, withFileLock } from "@zcode/shared/node";
import { z } from "zod";

const nonEmpty = z.string().min(1);
export const applicationIdSchema = z.string().regex(/^[a-z0-9-]{1,64}$/);
export const appNameSchema = z.string().trim().min(1).max(40);
const argumentSchema = z
  .string()
  .max(2048)
  .refine((text) => !text.includes("\0"));
export const argsSchema = z.array(argumentSchema).max(24);
const pathSchema = z
  .string()
  .max(8192)
  .refine((text) => !text.includes("\0"));
const modelSchema = z.object({ id: nonEmpty, name: nonEmpty });
const selectedModelSchema = modelSchema.extend({ enabled: z.boolean() });
const testSchema = z.object({
  at: z.number().nonnegative(),
  modelId: nonEmpty,
  modelName: nonEmpty,
  elapsedMs: z.number().nonnegative(),
  passed: z.boolean(),
  reply: z.string().max(4000).optional(),
  error: z.string().optional(),
});
const applicationSchema = z.object({
  id: applicationIdSchema,
  name: appNameSchema,
  path: pathSchema,
  args: argsSchema,
  enabled: z.boolean(),
  source: z.enum(["npm", "native"]).nullable(),
  version: z.string().nullable(),
  candidates: z.array(modelSchema),
  models: z.array(selectedModelSchema),
  test: testSchema.nullable(),
  history: z.array(testSchema).max(20),
});
const fileSchema = z.object({
  schemaVersion: z.literal(1),
  applications: z.array(applicationSchema),
});

export const programInputSchema = z.object({
  id: applicationIdSchema.optional(),
  name: appNameSchema.optional(),
  path: pathSchema,
  args: argsSchema.optional(),
});

export type ApplicationRecord = z.infer<typeof applicationSchema>;

export class AgentApplicationsRepo {
  private readonly file: string;

  constructor(private readonly directory: string) {
    this.file = join(directory, "agent-applications.json");
  }

  async read(): Promise<ApplicationRecord[]> {
    let raw: string;
    try {
      raw = await readFile(this.file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    try {
      return fileSchema.parse(JSON.parse(raw)).applications;
    } catch (cause) {
      throw new Error("The Agent application configuration could not be read.", { cause });
    }
  }

  async write(id: string, next: ApplicationRecord | null): Promise<void> {
    await withFileLock(this.file, async () => {
      const applications = await this.read();
      const index = applications.findIndex((item) => item.id === id);
      if (next && index === -1) applications.push(next);
      else if (next) applications[index] = next;
      else if (index >= 0) applications.splice(index, 1);
      const data = fileSchema.parse({ schemaVersion: 1, applications });
      await atomicWritePrivateTextFile(this.file, `${JSON.stringify(data, null, 2)}\n`);
    });
  }

  withApplicationLock<T>(id: string, action: () => Promise<T>): Promise<T> {
    return withFileLock(join(this.directory, `agent-application-${id}`), action);
  }
}
