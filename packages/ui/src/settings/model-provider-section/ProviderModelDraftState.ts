import type { ProviderSettingsFormModel } from "@/lib/providerSettingsFormTypes.js";
import {
  createProviderModelDraftValues,
  type ProviderModelDraftValues,
} from "./ProviderModelMetadata.js";
const FIELDS = [
  "supportsJsonSchemaOutputValue",
  "supportsNativeWebSearchValue",
  "supportsMidConversationSystemValue",
  "reasoningLevelValuesValue",
] as const;
export function projectModelDraft(
  draft: ProviderModelDraftValues,
  model: ProviderSettingsFormModel,
): ProviderModelDraftValues {
  const defaults = createProviderModelDraftValues({
    ...model,
    personalConfig: {},
    config: model.inheritedConfig ?? model.config,
  });
  const explicit = new Set(draft.overriddenFieldsValue ?? []);
  const next = { ...draft, inputFormatValue: { ...draft.inputFormatValue } };
  for (const field of FIELDS)
    if (!explicit.has(field)) Object.assign(next, { [field]: defaults[field] });
  for (const field of Object.keys(next.inputFormatValue) as (keyof typeof next.inputFormatValue)[])
    if (!explicit.has("inputFormatValue." + field))
      next.inputFormatValue[field] = defaults.inputFormatValue[field];
  return next;
}
export function updateModelDraft(
  draft: ProviderModelDraftValues,
  patch: Partial<ProviderModelDraftValues>,
): ProviderModelDraftValues {
  const explicit = new Set(draft.overriddenFieldsValue ?? []);
  for (const field of FIELDS) if (field in patch) explicit.add(field);
  if (patch.inputFormatValue)
    for (const field of Object.keys(
      patch.inputFormatValue,
    ) as (keyof typeof patch.inputFormatValue)[])
      if (patch.inputFormatValue[field] !== draft.inputFormatValue[field])
        explicit.add("inputFormatValue." + field);
  return { ...draft, ...patch, overriddenFieldsValue: [...explicit] };
}
export function modelDraftOverrides(draft: ProviderModelDraftValues): ReadonlySet<string> {
  const explicit = new Set(draft.overriddenFieldsValue ?? []);
  for (const field of [
    "contextWindowValue",
    "maxOutputTokensValue",
    "reasoningLevelMapValue",
    "maxOutputTokensMapValue",
  ] as const)
    if (draft[field].trim()) explicit.add(field);
  return explicit;
}
