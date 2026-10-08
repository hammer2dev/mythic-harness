import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { createProviderRuntime } from "../src/model-provider/providerRuntime.js";
import { decodeProviderConfigFile, encodeProviderConfigFile } from "@zcode/provider-node";
import {
  completeNewModelSelection,
  parseProviderTemplateMap,
  validateModelSelectionOptions,
} from "@zcode/provider";
import { providerProvisioningEnvelopeSchema } from "@zcode/shared";

test("unknown models require manual limits and preserve the real ID and sparse overrides", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-gateway-config-"));
  const path = join(dir, "provider_config.json");
  const runtime = createProviderRuntime({
    zcodeBuiltinFilePath: resolve("config/provider/zcode-builtin.json"),
    personalFilePath: path,
    personalPollingIntervalMs: false,
    watch: false,
  });
  try {
    const service = runtime.providerSettings;
    const { providerId } = await service.createPersonalProvider({
      providerName: "Fixture gateway",
      initialConfig: {
        api: { type: "openai-chat-completions", baseUrl: "https://fixture.invalid/v1" },
        access: { type: "api-key", apiKey: "fixture-key" },
      },
    });
    let view = await service.addPersonalModels(providerId, ["private-alias"]);
    let model = view.providers.find((p) => p.providerId === providerId)!.models[0]!;
    assert.equal(model.executable, false);
    assert.equal(model.effectiveConfig.properties?.contextWindow, undefined);
    assert.equal(model.effectiveConfig.optionSpecs?.maxOutputTokens?.max, undefined);
    assert.equal(model.effectiveConfig.optionSpecs?.reasoningLevel?.map, "{}");

    view = await service.savePersonalModelDraft({
      providerId,
      originalModelId: model.modelId,
      nextModelId: model.modelId,
      personalConfig: { properties: { contextWindow: 64000 } },
      basedOnRevision: view.revision,
    });
    model = view.providers.find((p) => p.providerId === providerId)!.models[0]!;
    assert.equal(model.executable, false);
    assert.equal(model.modelId, "private-alias");
    assert.equal(model.effectiveConfig.properties?.contextWindow, 64000);
    assert.equal(model.effectiveConfig.optionSpecs?.maxOutputTokens?.max, undefined);

    view = await service.savePersonalModelDraft({
      providerId,
      originalModelId: model.modelId,
      nextModelId: model.modelId,
      personalConfig: {
        properties: { contextWindow: 64000 },
        optionSpecs: { maxOutputTokens: { max: 4000 } },
      },
      basedOnRevision: view.revision,
    });
    model = view.providers.find((p) => p.providerId === providerId)!.models[0]!;
    assert.equal(model.executable, true);
    assert.equal(model.modelId, "private-alias");
    assert.equal(model.effectiveConfig.properties?.inputFormat?.supportsImage, false);
    assert.deepEqual(model.effectiveConfig.optionSpecs?.reasoningLevel?.values, ["default"]);
    assert.equal(model.effectiveConfig.optionSpecs?.reasoningLevel?.map, "{}");
    const registry = runtime.registryService.getView();
    const selection = completeNewModelSelection(registry, { providerId, modelId: model.modelId })!;
    assert.deepEqual(selection.options, { reasoningLevel: "default" });
    const executableModel = registry.providers.find((p) => p.providerId === providerId)!.models[0]!;
    assert.equal(validateModelSelectionOptions(executableModel, selection).ok, true);
    await assert.rejects(service.addPersonalModels(providerId, ["private-alias"]), /已存在/);
    await assert.rejects(
      service.savePersonalModelDraft({
        providerId,
        originalModelId: model.modelId,
        nextModelId: model.modelId,
        personalConfig: {},
        basedOnRevision: view.revision - 1,
      }),
      /revision conflict/,
    );

    const stored = JSON.parse(await readFile(path, "utf8"));
    const rule = stored.config.modelConfigRules.providerModelRules[0];
    assert.deepEqual(rule, {
      providerId,
      modelId: "private-alias",
      config: {
        properties: { contextWindow: 64000 },
        optionSpecs: { maxOutputTokens: { max: 4000 } },
      },
    });
    assert.deepEqual(encodeProviderConfigFile(decodeProviderConfigFile(stored)), stored);
    providerProvisioningEnvelopeSchema.parse({
      schemaVersion: 1,
      syncId: "fixture-sync",
      personalConfig: stored.config,
    });

    view = await service.savePersonalModelDraft({
      providerId,
      originalModelId: model.modelId,
      nextModelId: model.modelId,
      personalConfig: {},
      basedOnRevision: view.revision,
    });
    model = view.providers.find((p) => p.providerId === providerId)!.models[0]!;
    assert.equal(model.modelId, "private-alias");
    assert.equal(model.executable, false);
    assert.equal(model.personalExactConfig, undefined);
    assert.deepEqual(
      decodeProviderConfigFile(JSON.parse(await readFile(path, "utf8"))).models.toPersonalJSON()
        .providerModelRules,
      [],
    );
  } finally {
    runtime.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});

test("known model overrides survive builtin updates and clearing restores inheritance", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-gateway-inheritance-"));
  const path = join(dir, "provider_config.json");
  const builtinPath = join(dir, "zcode-builtin.json");
  const builtin = JSON.parse(await readFile(resolve("config/provider/zcode-builtin.json"), "utf8"));
  const knownRule = {
    modelMatch: "deepseek-flash",
    config: {
      properties: { contextWindow: 128000 },
      optionSpecs: { maxOutputTokens: { max: 16000 } },
    },
  };
  builtin.config.modelConfigRules.modelRules.push(knownRule);
  await writeFile(builtinPath, JSON.stringify(builtin));
  const runtime = createProviderRuntime({
    zcodeBuiltinFilePath: builtinPath,
    personalFilePath: path,
    personalPollingIntervalMs: false,
    watch: false,
  });
  try {
    const service = runtime.providerSettings;
    const { providerId } = await service.createPersonalProvider({
      providerName: "Fixture gateway",
      initialConfig: {
        api: { type: "openai-chat-completions", baseUrl: "https://fixture.invalid/v1" },
        access: { type: "api-key", apiKey: "fixture-key" },
      },
    });
    let view = await service.addPersonalModels(providerId, ["deepseek-flash"]);
    let model = view.providers.find((p) => p.providerId === providerId)!.models[0]!;
    assert.equal(model.executable, true);
    assert.equal(model.effectiveConfig.properties?.contextWindow, 128000);
    assert.equal(model.effectiveConfig.optionSpecs?.maxOutputTokens?.max, 16000);

    view = await service.savePersonalModelDraft({
      providerId,
      originalModelId: model.modelId,
      nextModelId: model.modelId,
      personalConfig: { properties: { contextWindow: 64000 } },
      basedOnRevision: view.revision,
    });
    const stored = JSON.parse(await readFile(path, "utf8"));
    assert.deepEqual(stored.config.modelConfigRules.providerModelRules[0].config, {
      properties: { contextWindow: 64000 },
    });

    knownRule.config.properties.contextWindow = 256000;
    knownRule.config.optionSpecs.maxOutputTokens.max = 32000;
    await writeFile(builtinPath, JSON.stringify(builtin));
    view = await service.refresh("fixture-builtin-update");
    model = view.providers.find((p) => p.providerId === providerId)!.models[0]!;
    assert.equal(model.modelId, "deepseek-flash");
    assert.equal(model.effectiveBuiltinConfig.properties?.contextWindow, 256000);
    assert.equal(model.effectiveConfig.properties?.contextWindow, 64000);
    assert.equal(model.effectiveConfig.optionSpecs?.maxOutputTokens?.max, 32000);

    view = await service.savePersonalModelDraft({
      providerId,
      originalModelId: model.modelId,
      nextModelId: model.modelId,
      personalConfig: {},
      basedOnRevision: view.revision,
    });
    model = view.providers.find((p) => p.providerId === providerId)!.models[0]!;
    assert.equal(model.executable, true);
    assert.equal(model.effectiveConfig.properties?.contextWindow, 256000);
    assert.equal(model.effectiveConfig.optionSpecs?.maxOutputTokens?.max, 32000);
    assert.equal(model.personalExactConfig, undefined);
  } finally {
    runtime.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});

test("template models are explicit personal members and stay removed after restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-gateway-members-"));
  const path = join(dir, "provider_config.json");
  const createRuntime = () =>
    createProviderRuntime({
      zcodeBuiltinFilePath: resolve("config/provider/zcode-builtin.json"),
      personalFilePath: path,
      personalPollingIntervalMs: false,
      watch: false,
    });
  let runtime = createRuntime();
  try {
    let service = runtime.providerSettings;
    const { providerId, view: created } = await service.createPersonalProvider({
      templateId: "deepseek",
      initialConfig: { access: { type: "api-key", apiKey: "fixture-key" } },
    });
    assert.deepEqual(created.providers.find((p) => p.providerId === providerId)!.models, []);

    let view = await service.addPersonalModels(providerId, ["deepseek-flash"]);
    let model = view.providers.find((p) => p.providerId === providerId)!.models[0]!;
    assert.equal(model.builtin, false);
    assert.equal(model.executable, true);
    assert.equal(model.effectiveConfig.properties?.contextWindow, 1048576);
    assert.equal(model.effectiveConfig.optionSpecs?.maxOutputTokens?.max, 393216);
    await service.addPersonalModels(providerId, ["deepseek-v4-pro"]);
    await service.reorderPersonalModels(providerId, ["deepseek-v4-pro", "deepseek-flash"]);
    view = await service.savePersonalProviderOverlay(providerId, {
      group: "standard-personal",
      access: { type: "api-key", apiKey: "fixture-key" },
      api: { type: "anthropic-messages", baseUrl: "https://fixture.invalid/anthropic" },
    });
    assert.deepEqual(
      view.providers.find((p) => p.providerId === providerId)!.models.map((m) => m.modelId),
      ["deepseek-v4-pro", "deepseek-flash"],
    );

    await service.deletePersonalModel(providerId, "deepseek-flash");
    let stored = decodeProviderConfigFile(JSON.parse(await readFile(path, "utf8")));
    assert.deepEqual(stored.providers.get(providerId)!.modelOrder, ["deepseek-v4-pro"]);
    assert.equal(stored.models.getExact(providerId, "deepseek-flash"), undefined);
    view = await service.deletePersonalModel(providerId, "deepseek-v4-pro");
    assert.deepEqual(view.providers.find((p) => p.providerId === providerId)!.models, []);
    stored = decodeProviderConfigFile(JSON.parse(await readFile(path, "utf8")));
    assert.deepEqual(stored.providers.get(providerId)!.personalModelIds, []);
    assert.deepEqual(stored.providers.get(providerId)!.modelOrder, []);
    assert.deepEqual(stored.models.toPersonalJSON().providerModelRules, []);

    runtime.dispose();
    runtime = createRuntime();
    await runtime.start();
    service = runtime.providerSettings;
    view = await service.getView();
    assert.deepEqual(view.providers.find((p) => p.providerId === providerId)!.models, []);
    view = await service.addPersonalModels(providerId, ["deepseek-flash"]);
    model = view.providers.find((p) => p.providerId === providerId)!.models[0]!;
    assert.equal(model.builtin, false);
    assert.equal(model.executable, true);
    assert.equal(model.effectiveConfig.properties?.contextWindow, 1048576);

    assert.throws(() =>
      parseProviderTemplateMap([
        {
          templateId: "fixture-template",
          templateNameMap: { "en-US": "Fixture" },
          config: { builtinModelIds: ["deepseek-flash"] },
        },
      ]),
    );
  } finally {
    runtime.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});

test("model batches preserve selection order and reject conflicts without partial writes", async () => {
  const dir = await mkdtemp(join(tmpdir(), "model-gateway-batch-"));
  const path = join(dir, "provider_config.json");
  const createRuntime = () =>
    createProviderRuntime({
      zcodeBuiltinFilePath: resolve("config/provider/zcode-builtin.json"),
      personalFilePath: path,
      personalPollingIntervalMs: false,
      watch: false,
    });
  let runtime = createRuntime();
  try {
    const service = runtime.providerSettings;
    const { providerId } = await service.createPersonalProvider({
      templateId: "deepseek",
      initialConfig: {
        access: { type: "api-key", apiKey: "fixture-key" },
        api: { baseUrl: "https://fixture.invalid/anthropic" },
      },
    });
    const modelIds = ["private-alias", "deepseek-flash"];
    let view = await service.addPersonalModels(providerId, modelIds);
    let models = view.providers.find((p) => p.providerId === providerId)!.models;
    assert.deepEqual(
      models.map((model) => model.modelId),
      modelIds,
    );
    assert.equal(models[0]!.executable, false);
    assert.equal(models[1]!.executable, true);
    assert.equal(models[1]!.effectiveConfig.properties?.contextWindow, 1048576);

    const before = await readFile(path, "utf8");
    const stored = decodeProviderConfigFile(JSON.parse(before));
    assert.deepEqual(stored.providers.get(providerId)!.personalModelIds, modelIds);
    assert.deepEqual(stored.providers.get(providerId)!.modelOrder, modelIds);
    assert.deepEqual(
      stored.models.toPersonalJSON().providerModelRules.map((rule) => rule.modelId),
      modelIds,
    );
    await assert.rejects(
      service.addPersonalModels(providerId, ["another-alias", "deepseek-flash"]),
      /已存在/,
    );
    assert.equal(await readFile(path, "utf8"), before);
    view = await service.getView();
    assert.deepEqual(
      view.providers.find((p) => p.providerId === providerId)!.models.map((model) => model.modelId),
      modelIds,
    );

    runtime.dispose();
    runtime = createRuntime();
    view = await runtime.providerSettings.getView();
    models = view.providers.find((p) => p.providerId === providerId)!.models;
    assert.deepEqual(
      models.map((model) => model.modelId),
      modelIds,
    );
    assert.equal(models[0]!.executable, false);
    assert.equal(models[1]!.executable, true);
  } finally {
    runtime.dispose();
    await rm(dir, { recursive: true, force: true });
  }
});
