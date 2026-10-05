import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";
import { parseProviderConfig } from "@zcode/provider";
import { NodeZCodeBuiltinProviderConfigSource } from "@zcode/provider-node";
import { providerProvisioningEnvelopeSchema } from "@zcode/shared";
import { configureCodingPlanApiKey } from "../../../apps/zcode-cli/packages/bootstrap/src/auth-api-key.js";

const bundled = resolve("config/provider/zcode-builtin.json");

test("bundled configuration keeps four Key templates and has no account providers", async () => {
  const source = new NodeZCodeBuiltinProviderConfigSource({
    bundledFilePath: bundled,
    watch: false,
  });
  try {
    const config = await source.read();
    for (const id of ["zai-api", "bigmodel-api", "zai-standard-api", "bigmodel-standard-api"])
      assert.ok(config.providerTemplates?.keys().includes(id));
    assert.equal(config.providers.keys().length, 0);
    for (const [, template] of config.providerTemplates!.entries())
      assert.equal(template.config.access?.type, "api-key");
    assert.throws(() => parseProviderConfig({ access: { type: "zhipu-account" } }));
  } finally {
    source.dispose();
  }
});

test("manual Key configuration updates one personal Provider without creating account credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zcode-custom-model-"));
  const path = join(dir, "provider_config.json");
  try {
    const options = {
      providerId: "zai" as const,
      personalProviderConfigPath: path,
      env: { ZCODE_BUILTIN_PROVIDER_CONFIG_FILE: bundled },
    };
    await configureCodingPlanApiKey({ ...options, apiKey: "fixture-key-1" });
    await configureCodingPlanApiKey({ ...options, apiKey: "fixture-key-2" });
    const stored = JSON.parse(await readFile(path, "utf8"));
    const rules = stored.config.providerConfigRules.providerRules;
    assert.equal(rules.length, 1);
    assert.equal(rules[0].templateId, "zai-api");
    assert.equal(rules[0].config.access.apiKey, "fixture-key-2");
    assert.equal(stored.config.defaultModelSelection.providerId, rules[0].providerId);
    assert.ok(!rules[0].providerId.startsWith("account:"));
    assert.ok(!(await readdir(dir)).includes("credentials.json"));
    assert.throws(() =>
      providerProvisioningEnvelopeSchema.parse({
        schemaVersion: 1,
        syncId: "fixture",
        personalConfig: stored.config,
        credentials: [],
      }),
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
