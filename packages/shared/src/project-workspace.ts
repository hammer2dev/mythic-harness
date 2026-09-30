import { z } from "zod";

/** 用户提交消息时固定的项目目录配置；不是会话的 cwd 或 workspaceIdentity。 */
export const zcodeProjectWorkspaceSchema = z
  .object({
    projectId: z.string().trim().min(1),
    name: z.string().trim().min(1),
    primaryDirectory: z.string().trim().min(1),
    directories: z.array(z.string().trim().min(1)).min(1),
  })
  .strict()
  .refine((value) => value.directories.includes(value.primaryDirectory), {
    message: "primaryDirectory must be included in directories",
    path: ["primaryDirectory"],
  });

export type ZCodeProjectWorkspace = z.infer<typeof zcodeProjectWorkspaceSchema>;
