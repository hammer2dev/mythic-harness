import { useCallback, useRef, useState } from "react";
import type { ModelConfigObject, ModelConfigResolution } from "@zcode/provider";
import type { ProviderSettingsFormModel } from "@/lib/providerSettingsFormTypes.js";
import {
  createProviderModelDraftValues,
  resolveProviderModelDraftCommit,
  type ProviderModelDraftValues,
} from "./ProviderModelMetadata.js";
import {
  modelDraftOverrides,
  projectModelDraft,
  updateModelDraft,
} from "./ProviderModelDraftState.js";
import { useModelConfigResolution } from "./useModelConfigResolution.js";

export function useProviderModelDraft({
  model,
  open,
  scopeKey,
  resolve,
}: {
  model: ProviderSettingsFormModel;
  open: boolean;
  scopeKey: string;
  resolve?: (modelId: string, personalConfig: ModelConfigObject) => Promise<ModelConfigResolution>;
}) {
  const [raw, setRaw] = useState(() => createProviderModelDraftValues(model));
  const [scope, setScope] = useState(scopeKey);
  if (scope !== scopeKey) {
    setScope(scopeKey);
    setRaw(createProviderModelDraftValues(model));
  }
  const resolveRef = useRef(resolve);
  resolveRef.current = resolve;
  const baselineUnchanged = raw.idValue.trim() === model.modelId;
  const resolveBaseline = useCallback(
    (id: string) => {
      if (!resolveRef.current) throw new Error("Model Config Resolution 未配置");
      return resolveRef.current(id, {});
    },
    [scopeKey],
  );
  const config = useModelConfigResolution({
    open,
    modelId: raw.idValue,
    originalModelId: baselineUnchanged ? model.modelId : undefined,
    resolve: resolve ? resolveBaseline : undefined,
  });
  const modelWithResolution = (
    resolution: ModelConfigResolution | null | undefined,
  ): ProviderSettingsFormModel =>
    resolution
      ? {
          ...model,
          config: resolution.inheritedConfig,
          inheritedConfig: resolution.inheritedConfig,
        }
      : baselineUnchanged
        ? model
        : { ...model, config: {}, inheritedConfig: undefined };
  const currentModel = modelWithResolution(config.resolution);
  const draft = projectModelDraft(raw, currentModel);
  const reset = (next: ProviderSettingsFormModel) => {
    config.cancel();
    setRaw(createProviderModelDraftValues(next));
  };
  const commit = async () => {
    const needsResolution = resolve && !baselineUnchanged && raw.idValue.trim();
    const resolution = needsResolution
      ? (config.resolution ?? (await config.flush()))
      : config.resolution;
    if (needsResolution && !resolution) throw new Error("Model Config Resolution 尚未就绪");
    const resolved = modelWithResolution(resolution);
    return resolveProviderModelDraftCommit({
      currentModel: resolved,
      draft: projectModelDraft(raw, resolved),
    });
  };
  return {
    draft,
    change: (patch: Partial<ProviderModelDraftValues>) => setRaw(updateModelDraft(draft, patch)),
    reset,
    commit,
    overrides: modelDraftOverrides(draft),
    inheritedConfig: currentModel.inheritedConfig,
    pending: Boolean(resolve && raw.idValue.trim() && !baselineUnchanged && !config.resolution),
    defaultsLoaded: config.defaultsLoaded,
    flush: config.flush,
    cancel: config.cancel,
  };
}
