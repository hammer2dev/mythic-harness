import type { EffectiveModelSelectionResult } from "@zcode/shared/model-selection";
export type { EffectiveModelSelectionResult } from "@zcode/shared/model-selection";
import {
  validateModelSelectionOptions,
  type ModelSelection,
  type ProviderRegistryView,
} from "./registry.js";

/** 解析下一次执行的模型选择；不改写用户偏好或已固定的运行。 */
export function resolveEffectiveModelSelection(input: {
  readonly selection: ModelSelection | null;
  readonly registry: ProviderRegistryView;
}): EffectiveModelSelectionResult {
  const selection = input.selection;
  if (!selection)
    return Object.freeze({ effectiveSelection: null, selectionIssue: "selection-missing" });
  const provider = input.registry.providers.find(
    (candidate) => candidate.providerId === selection.providerId,
  );
  if (!provider || provider.config.visibility === "hidden")
    return Object.freeze({ effectiveSelection: null, selectionIssue: "provider-not-found" });
  const model = provider.models.find((candidate) => candidate.modelId === selection.modelId);
  if (!model) return Object.freeze({ effectiveSelection: null, selectionIssue: "model-not-found" });
  const validation = validateModelSelectionOptions(model, selection);
  return Object.freeze({
    effectiveSelection: Object.freeze({
      providerId: selection.providerId,
      modelId: selection.modelId,
      ...(validation.ok && selection.options
        ? { options: Object.freeze({ ...selection.options }) }
        : {}),
    }),
    ...(!validation.ok &&
    (validation.code === "reasoning-level-missing" ||
      validation.code === "reasoning-level-not-supported")
      ? { selectionIssue: validation.code }
      : {}),
  });
}
