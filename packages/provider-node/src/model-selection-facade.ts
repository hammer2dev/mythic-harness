import { ModelSelectionFacade, type ProviderRegistryFacadeSource } from "@zcode/provider";
export function createNodeModelSelectionFacade(
  source: ProviderRegistryFacadeSource,
): ModelSelectionFacade {
  return new ModelSelectionFacade(source);
}
