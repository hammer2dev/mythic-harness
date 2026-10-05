import { z } from "zod";
import { parsePluginStoreOrder, type PluginStoreOrder } from "./pluginStoreOrder.js";

export interface ForceUpdateConfig {
  minimalVersion: string;
}

/** 只允许显式接入的公开字段进入服务快照，不透传账户或 Provider 配置。 */
export interface ClientConfigSnapshot {
  pluginStoreOrder: PluginStoreOrder | null;
  dynamicWorkflow?: unknown;
  forceUpdate?: ForceUpdateConfig | null;
}

export const clientConfigReadOptionsSchema = z.object({
  forceRefresh: z.boolean().optional(),
});
export type ClientConfigReadOptions = z.infer<typeof clientConfigReadOptionsSchema>;

const envelopeSchema = z.object({
  code: z.literal(0),
  data: z
    .object({
      configs: z
        .object({
          pluginStoreOrder: z.unknown().optional(),
          dynamicWorkflow: z.unknown().optional(),
          forceUpdate: z.unknown().optional(),
        })
        .nullish(),
    })
    .nullish(),
});

export function parseClientConfigSnapshot(payload: unknown): ClientConfigSnapshot {
  const parsed = envelopeSchema.safeParse(payload);
  if (!parsed.success) throw new Error("Invalid public client config response");
  const configs = parsed.data.data?.configs;
  const update = z
    .object({ minimalVersion: z.string().trim().min(1) })
    .safeParse(configs?.forceUpdate);
  return {
    pluginStoreOrder: parsePluginStoreOrder(configs?.pluginStoreOrder),
    dynamicWorkflow: configs?.dynamicWorkflow,
    forceUpdate: update.success ? update.data : null,
  };
}
