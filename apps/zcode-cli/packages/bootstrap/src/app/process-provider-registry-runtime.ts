import {
  NodeModelSelectionConfigRepository,
  NodeProviderRegistryRuntime,
  resolveNodeProviderRuntimePaths,
} from "@zcode/provider-node";

export async function startProcessProviderRegistryRuntime(
  env: Readonly<Record<string, string | undefined>>,
) {
  const paths = resolveNodeProviderRuntimePaths(env);
  if (!paths) throw new Error("缺少 Provider Config 路径");
  const runtime = new NodeProviderRegistryRuntime(paths);
  const modelSelectionConfigRepository = new NodeModelSelectionConfigRepository({
    personalRepository: runtime.personalRepository,
  });
  try {
    await runtime.start();
    const configuredDefaultModelSelection = await modelSelectionConfigRepository.read();
    return Object.freeze({
      runtime,
      snapshot: runtime.registryService.getSnapshot()!,
      modelSelectionConfigRepository,
      configuredDefaultModelSelection,
      dispose() {
        modelSelectionConfigRepository.dispose();
        runtime.dispose();
      },
    });
  } catch (error) {
    modelSelectionConfigRepository.dispose();
    runtime.dispose();
    throw error;
  }
}
