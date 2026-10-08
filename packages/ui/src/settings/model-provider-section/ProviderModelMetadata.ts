import type { ProviderSettingsFormModel } from "@/lib/providerSettingsFormTypes.js";
import type { ModelInputFormatData } from "@zcode/shared/model-config";
import { EnumOptionSpecConfig, LimitOptionSpecConfig, ModelConfig } from "@zcode/provider";

export type ProviderModelInputFormatDraft = ModelInputFormatData;
export interface ProviderModelDraftValues {
  idValue: string;
  contextWindowValue: string;
  maxOutputTokensValue: string;
  maxOutputTokensMapValue: string;
  inputFormatValue: ProviderModelInputFormatDraft;
  enabledValue?: boolean;
  overriddenFieldsValue?: readonly string[];
  supportsJsonSchemaOutputValue?: boolean;
  supportsNativeWebSearchValue?: boolean;
  supportsMidConversationSystemValue?: boolean;
  reasoningLevelValuesValue: readonly string[];
  reasoningLevelMapValue: string;
}
export type ProviderModelDraftCommitResult =
  | { status: "commit"; model: ProviderSettingsFormModel }
  | {
      status: "invalid";
      field:
        | "id"
        | "contextWindow"
        | "maxOutputTokens"
        | "inputFormat"
        | "reasoningLevelValues"
        | "reasoningLevelMap";
    };

export function createProviderModelDraftValues(
  model: ProviderSettingsFormModel,
): ProviderModelDraftValues {
  const properties = model.config.properties;
  const personal = model.personalConfig;
  const explicit: string[] = [];
  for (const key of [
    "supportsJsonSchemaOutput",
    "supportsNativeWebSearch",
    "supportsMidConversationSystem",
  ] as const)
    if (personal.properties?.[key] != null) explicit.push(key + "Value");
  for (const [key, value] of Object.entries(personal.properties?.inputFormat ?? {}))
    if (value != null) explicit.push("inputFormatValue." + key);
  if (personal.optionSpecs?.reasoningLevel?.values) explicit.push("reasoningLevelValuesValue");
  return {
    idValue: model.modelId,
    contextWindowValue:
      personal.properties?.contextWindow == null ? "" : String(personal.properties.contextWindow),
    maxOutputTokensValue:
      personal.optionSpecs?.maxOutputTokens?.max == null
        ? ""
        : String(personal.optionSpecs.maxOutputTokens.max),
    maxOutputTokensMapValue: personal.optionSpecs?.maxOutputTokens?.map ?? "",
    reasoningLevelMapValue: personal.optionSpecs?.reasoningLevel?.map ?? "",
    reasoningLevelValuesValue: properties
      ? [...(model.config.optionSpecs?.reasoningLevel?.values ?? ["default"])]
      : ["default"],
    inputFormatValue: {
      supportsText: properties?.inputFormat?.supportsText ?? true,
      supportsImage: properties?.inputFormat?.supportsImage ?? false,
      supportsVideo: properties?.inputFormat?.supportsVideo ?? false,
      supportsAudio: properties?.inputFormat?.supportsAudio ?? false,
      supportsPdf: properties?.inputFormat?.supportsPdf ?? false,
    },
    enabledValue: model.config.enabled !== false,
    overriddenFieldsValue: explicit,
    supportsJsonSchemaOutputValue: properties?.supportsJsonSchemaOutput ?? false,
    supportsNativeWebSearchValue: properties?.supportsNativeWebSearch ?? false,
    supportsMidConversationSystemValue: properties?.supportsMidConversationSystem ?? false,
  };
}

export function resolveProviderModelDraftCommit({
  currentModel,
  draft,
}: {
  currentModel: ProviderSettingsFormModel;
  draft: ProviderModelDraftValues;
}): ProviderModelDraftCommitResult {
  const id = draft.idValue.trim();
  if (!id) return { status: "invalid", field: "id" };
  const personal = { ...structuredClone(currentModel.personalConfig) };
  const properties = { ...personal.properties };
  const options = { ...personal.optionSpecs };
  const explicit = new Set(draft.overriddenFieldsValue ?? []);
  for (const [input, field] of [
    [draft.contextWindowValue, "contextWindow"],
    [draft.maxOutputTokensValue, "maxOutputTokens"],
  ] as const) {
    const value = input.trim() ? Number(input) : undefined;
    if (value !== undefined && (!Number.isInteger(value) || value <= 0))
      return { status: "invalid", field };
    if (field === "contextWindow") {
      if (value === undefined) delete properties.contextWindow;
      else properties.contextWindow = value;
    } else {
      const map = draft.maxOutputTokensMapValue.trim();
      options.maxOutputTokens = {
        ...(value === undefined ? {} : { max: value }),
        ...(map ? { map } : {}),
      };
      if (Object.keys(options.maxOutputTokens).length === 0) delete options.maxOutputTokens;
      if (
        map &&
        new LimitOptionSpecConfig({
          max: value ?? currentModel.config.optionSpecs?.maxOutputTokens?.max ?? 1,
          map,
        }).validateComplete().length
      )
        return { status: "invalid", field: "maxOutputTokens" };
    }
  }
  for (const key of [
    "supportsJsonSchemaOutput",
    "supportsNativeWebSearch",
    "supportsMidConversationSystem",
  ] as const)
    if (explicit.has(key + "Value"))
      properties[key] = draft[(key + "Value") as "supportsJsonSchemaOutputValue"];
  const input = { ...properties.inputFormat };
  for (const key of ["supportsImage", "supportsVideo", "supportsAudio", "supportsPdf"] as const)
    if (explicit.has("inputFormatValue." + key)) input[key] = draft.inputFormatValue[key];
  if (Object.keys(input).length) properties.inputFormat = input;
  else delete properties.inputFormat;
  const values = draft.reasoningLevelValuesValue.map((value) => value.trim());
  if (!values.length || values.some((value) => !value) || new Set(values).size !== values.length)
    return { status: "invalid", field: "reasoningLevelValues" };
  const map = draft.reasoningLevelMapValue.trim();
  const effectiveMap =
    map || currentModel.inheritedConfig?.optionSpecs?.reasoningLevel?.map || "{}";
  if (new EnumOptionSpecConfig({ values, map: effectiveMap }).validateComplete().length)
    return { status: "invalid", field: "reasoningLevelMap" };
  const reasoning = { ...options.reasoningLevel };
  if (explicit.has("reasoningLevelValuesValue")) reasoning.values = values;
  if (map) reasoning.map = map;
  else delete reasoning.map;
  if (Object.keys(reasoning).length) options.reasoningLevel = reasoning;
  else delete options.reasoningLevel;
  if (Object.keys(properties).length) personal.properties = properties;
  else delete personal.properties;
  if (Object.keys(options).length) personal.optionSpecs = options;
  else delete personal.optionSpecs;
  return {
    status: "commit",
    model: {
      ...currentModel,
      modelId: id,
      personalConfig: personal,
      hasPersonalConfig: Object.keys(personal).length > 0,
      config: ModelConfig.fromData(currentModel.inheritedConfig ?? {})
        .overlay(ModelConfig.fromData(personal))
        .toJSON(),
    },
  };
}
