import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ConfigKey, DEFAULT_TOOL_SEARCH_CONFIG } from "@zcode/contracts";
import { createConfig, ZCodeConfigFileSchema } from "@zcode/adapters/config";
import { ProviderRegistry } from "@zcode/provider";
import { resolveAppRuntimeConfig } from "./runtime-config.js";

test("ToolSearch config validates JSON, merges fields by scope and honors runtime overrides", async () => {
  const root = await mkdtemp(join(tmpdir(), "tool-search-config-"));
  try {
    const workspace = join(root, "project");
    await mkdir(workspace);
    const userConfigPath = join(root, "user.json");
    const projectConfigPath = join(root, "project.json");
    await writeFile(
      userConfigPath,
      JSON.stringify({ toolSearch: { schemaTokenBudget: 12000, maxResults: 4 } }),
    );
    await writeFile(projectConfigPath, JSON.stringify({ toolSearch: { maxResults: 2 } }));
    const defaults = createConfig({ skipUserConfig: true, env: {} });
    assert.deepEqual(defaults.config.toolSearch, DEFAULT_TOOL_SEARCH_CONFIG);
    const configResult = createConfig({
      userConfigPath,
      projectConfigPath,
      workingDirectory: workspace,
      env: {},
    });
    assert.deepEqual(configResult.config.toolSearch, { schemaTokenBudget: 12000, maxResults: 2 });
    assert.equal(configResult.configPort.get(ConfigKey.ToolSearchSchemaTokenBudget), 12000);
    assert.equal(
      ZCodeConfigFileSchema.parse({ toolSearch: { maxResults: 6 } }).toolSearch?.maxResults,
      6,
    );
    assert.throws(() => ZCodeConfigFileSchema.parse({ toolSearch: { maxResults: 0 } }));
    assert.throws(() => ZCodeConfigFileSchema.parse({ toolSearch: { schemaTokenBudget: 0 } }));
    const { runtimeConfig } = resolveAppRuntimeConfig({
      cliStorageRoot: root,
      configResult,
      workingDirectory: workspace,
      subagentOutputRootDir: join(root, "agents"),
      options: {
        providerRegistry: new ProviderRegistry(),
        env: {},
        runtimeConfig: { toolSearch: { schemaTokenBudget: 8000 } },
      },
    });
    assert.deepEqual(runtimeConfig.toolSearch, { schemaTokenBudget: 8000, maxResults: 2 });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
