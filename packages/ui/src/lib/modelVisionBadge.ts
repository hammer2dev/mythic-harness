import type { ProviderConfigObject } from "@zcode/provider";
export function shouldShowModelVisionBadge(
  _modelId: string,
  supportsImage: boolean | null | undefined,
  _access?: ProviderConfigObject["access"],
): boolean {
  return supportsImage === true;
}
