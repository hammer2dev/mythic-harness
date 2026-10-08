import { z } from "zod";
import type { ModelId, ProviderConfigObject } from "@zcode/provider";

class ModelCatalogError extends Error {}

const pageSchema = z.object({
  data: z.array(z.object({ id: z.string() })),
  has_more: z.boolean().optional(),
  last_id: z.string().optional(),
});

/** Host 网络出口由装配层注入，目录仅返回 ID，不推断模型能力。 */
export function createModelCatalogReader(fetchImpl: typeof fetch, timeoutMs = 20000) {
  const active = new Set<AbortController>();
  let disposed = false;
  return {
    async read(config: ProviderConfigObject): Promise<readonly ModelId[]> {
      if (disposed) throw new ModelCatalogError("Model directory has been disposed");
      if (
        !config.api?.baseUrl ||
        !config.api.type ||
        config.access?.type !== "api-key" ||
        !config.access.apiKey
      )
        throw new ModelCatalogError("Model directory requires an API address, key and format");
      const controller = new AbortController();
      active.add(controller);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new ModelCatalogError("Model directory request timed out"));
        }, timeoutMs);
      });
      try {
        return await Promise.race([
          config.api.type === "anthropic-messages"
            ? readAnthropicModels(fetchImpl, config, controller.signal)
            : readOpenAIModels(fetchImpl, config, controller.signal),
          deadline,
        ]);
      } catch (error) {
        // 网关错误可能包含 Key 或原始响应体；只跨服务边界传递本模块生成的安全摘要。
        if (error instanceof ModelCatalogError) throw error;
        throw new ModelCatalogError(
          controller.signal.aborted
            ? "Model directory request timed out"
            : "Model directory request failed",
        );
      } finally {
        clearTimeout(timer);
        controller.abort();
        active.delete(controller);
      }
    },
    dispose() {
      disposed = true;
      for (const controller of active) controller.abort();
      active.clear();
    },
  };
}

function readOpenAIModels(
  fetchImpl: typeof fetch,
  config: ProviderConfigObject,
  signal: AbortSignal,
) {
  return readPages(fetchImpl, config, signal, false);
}

function readAnthropicModels(
  fetchImpl: typeof fetch,
  config: ProviderConfigObject,
  signal: AbortSignal,
) {
  return readPages(fetchImpl, config, signal, true);
}

async function readPages(
  fetchImpl: typeof fetch,
  config: ProviderConfigObject,
  signal: AbortSignal,
  anthropic: boolean,
): Promise<readonly ModelId[]> {
  const url = new URL(config.api!.baseUrl!);
  const basePath = url.pathname.replace(/\/+$/, "");
  // DeepSeek 的 Anthropic 兼容端点没有标准模型目录；官方文档指定同源 /models。
  const deepseekDirectory =
    anthropic && url.origin === "https://api.deepseek.com" && basePath === "/anthropic";
  const anthropicDirectory = anthropic && !deepseekDirectory;
  url.pathname = deepseekDirectory
    ? "/models"
    : `${basePath}${anthropicDirectory && !basePath.endsWith("/v1") ? "/v1" : ""}/models`;
  const headers = new Headers();
  headers.set("Authorization", `Bearer ${config.access!.apiKey}`);
  if (anthropicDirectory) {
    headers.set("x-api-key", config.access!.apiKey!);
    headers.set("anthropic-version", "2023-06-01");
    url.searchParams.set("limit", "1000");
  }
  for (const [key, value] of Object.entries(config.api!.headers ?? {})) headers.set(key, value);
  const ids = new Set<ModelId>();
  const cursors = new Set<string>();
  while (true) {
    const response = await fetchImpl(url, { headers, signal, redirect: "error" });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ModelCatalogError(`Model directory request failed (HTTP ${response.status})`);
    }
    const parsed = pageSchema.safeParse(await response.json());
    if (!parsed.success)
      throw new ModelCatalogError("Model directory response format is unsupported");
    const page = parsed.data;
    for (const item of page.data) if (item.id.trim()) ids.add(item.id);
    if (!page.has_more) return [...ids];
    const cursor = page.last_id ?? page.data.at(-1)?.id;
    if (!cursor || cursors.has(cursor))
      throw new ModelCatalogError("Model directory pagination is invalid");
    cursors.add(cursor);
    url.searchParams.set(anthropicDirectory ? "after_id" : "after", cursor);
  }
}
