import { join } from "node:path";
import { homedir } from "node:os";
import { ApiKeyAccessConfig, ProviderConfig, completeNewModelSelection } from "@zcode/provider";
import {
  NodeModelSelectionConfigRepository,
  NodeProviderRegistryRuntime,
  PERSONAL_PROVIDER_CONFIG_FILE_NAME,
  ZCODE_BUILTIN_PROVIDER_CONFIG_FILE_ENV,
  ZCODE_PERSONAL_PROVIDER_CONFIG_FILE_ENV,
} from "@zcode/provider-node";

export type CodingPlanProviderId = "zai" | "bigmodel";
export interface ConfigureCodingPlanApiKeyOptions {
  apiKey: string;
  env?: Record<string, string | undefined>;
  personalProviderConfigPath?: string;
  providerId: CodingPlanProviderId;
}
export interface ConfigureCodingPlanApiKeyResult {
  configPath: string;
  model: string;
  providerId: CodingPlanProviderId;
}

/** 手动 Key 直接写入 Personal Provider，不生成账号身份或 OAuth 凭据。 */
export async function configureCodingPlanApiKey(
  options: ConfigureCodingPlanApiKeyOptions,
): Promise<ConfigureCodingPlanApiKeyResult> {
  const apiKey = options.apiKey.trim();
  if (!apiKey) throw new Error("API Key 不能为空");
  const env = options.env ?? process.env;
  const bundled = env[ZCODE_BUILTIN_PROVIDER_CONFIG_FILE_ENV]?.trim();
  if (!bundled) throw new Error("内置模型配置路径未初始化");
  const path =
    options.personalProviderConfigPath ??
    env[ZCODE_PERSONAL_PROVIDER_CONFIG_FILE_ENV]?.trim() ??
    join(
      env.ZCODE_DATA_BASE_DIR?.trim() || homedir(),
      ".zcode",
      "v2",
      PERSONAL_PROVIDER_CONFIG_FILE_NAME,
    );
  const templateId = options.providerId + "-api";
  const runtime = new NodeProviderRegistryRuntime({
    zcodeBuiltinFilePath: bundled,
    personalFilePath: path,
    personalPollingIntervalMs: false,
    watch: false,
  });
  const selections = new NodeModelSelectionConfigRepository({
    personalRepository: runtime.personalRepository,
  });
  try {
    const config = await runtime.configService.read();
    const existing = config.personalProviders
      .rules()
      .find((rule) => rule.templateId === templateId);
    const access = new ApiKeyAccessConfig({ apiKey });
    const providerId =
      existing?.providerId ??
      (
        await runtime.configService.createPersonalProvider({
          templateId,
          initialConfig: new ProviderConfig({ access }),
        })
      ).providerId;
    if (existing)
      await runtime.configService.savePersonalProviderOverlay(
        providerId,
        existing.config.overlay(new ProviderConfig({ access })),
      );
    await runtime.start();
    const view = runtime.registryService.getView();
    const modelId = view.providers.find((provider) => provider.providerId === providerId)?.models[0]
      ?.modelId;
    const selection = modelId
      ? completeNewModelSelection(view, { providerId, modelId })
      : undefined;
    if (!selection) throw new Error("模板没有可执行模型");
    await selections.saveConfiguredDefault(selection);
    return { configPath: path, model: providerId + "/" + modelId, providerId: options.providerId };
  } finally {
    selections.dispose();
    runtime.dispose();
  }
}
