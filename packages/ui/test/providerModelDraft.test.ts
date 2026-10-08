import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseZCodeBuiltinModelConfigRules } from "@zcode/provider";
import type { ProviderSettingsFormModel } from "../src/lib/providerSettingsFormTypes.js";
import {
  createProviderModelDraftValues,
  resolveProviderModelDraftCommit,
} from "../src/settings/model-provider-section/ProviderModelMetadata.js";
import {
  projectModelDraft,
  updateModelDraft,
} from "../src/settings/model-provider-section/ProviderModelDraftState.js";

test("model editing preserves explicit overrides across builtin updates and clearing restores inheritance", async () => {
  const builtin = JSON.parse(await readFile("config/provider/zcode-builtin.json", "utf8"));
  const rules = parseZCodeBuiltinModelConfigRules(builtin.config.modelConfigRules);
  const base = (): ProviderSettingsFormModel => {
    const config = rules
      .resolve({
        providerId: "fixture",
        modelId: "gpt-5.6-sol",
        apiType: "openai-chat-completions",
      })
      .toJSON();
    return {
      kind: "candidate",
      modelId: "gpt-5.6-sol",
      builtin: false,
      personalConfig: {},
      config,
      inheritedConfig: config,
      hasPersonalConfig: false,
      executable: true,
      selectable: true,
    };
  };
  const model = base();
  const original = createProviderModelDraftValues(model);
  const unchanged = resolveProviderModelDraftCommit({ currentModel: model, draft: original });
  assert.equal(unchanged.status, "commit");
  if (unchanged.status === "commit") assert.deepEqual(unchanged.model.personalConfig, {});

  const edited = updateModelDraft(original, {
    contextWindowValue: "64000",
    supportsJsonSchemaOutputValue: false,
  });
  const nextConfig = {
    ...model.config,
    properties: {
      ...model.config.properties,
      contextWindow: 512000,
      inputFormat: { ...model.config.properties?.inputFormat, supportsImage: false },
    },
  };
  const updated = { ...model, config: nextConfig, inheritedConfig: nextConfig };
  const projected = projectModelDraft(edited, updated);
  assert.equal(projected.inputFormatValue.supportsImage, false);
  const committed = resolveProviderModelDraftCommit({ currentModel: updated, draft: projected });
  assert.equal(committed.status, "commit");
  if (committed.status === "commit") {
    assert.equal(committed.model.modelId, "gpt-5.6-sol");
    assert.deepEqual(committed.model.personalConfig, {
      properties: { contextWindow: 64000, supportsJsonSchemaOutput: false },
    });
  }
  const cleared = resolveProviderModelDraftCommit({
    currentModel: updated,
    draft: { ...projected, contextWindowValue: "" },
  });
  assert.equal(cleared.status, "commit");
  if (cleared.status === "commit") {
    assert.equal(cleared.model.personalConfig.properties?.contextWindow, undefined);
    assert.equal(cleared.model.config.properties?.contextWindow, 512000);
  }
});
