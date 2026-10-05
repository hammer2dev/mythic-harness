import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PluginManifest, PluginStoreListing } from "@zcode/contracts";
import { fileExists, isNotFoundError, isRecord } from "./helpers.js";
import {
  loadPluginMcpServerDefinitions,
  loadPluginMcpServerDefinitionsAsync,
} from "./mcp-definitions.js";
import type { LoadedPlugin } from "./types.js";

export const DEFAULT_PLUGIN_VERSION = "0.0.0";
const PLUGIN_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/;
const MANIFEST_PATHS = [
  join(".zcode-plugin", "plugin.json"),
  join(".claude-plugin", "plugin.json"),
  join(".codex-plugin", "plugin.json"),
];
const ACCOUNT_AUTH_TYPE = "zcode_official";

interface MarketplacePluginEntry {
  name: string;
  version?: string;
  strict?: boolean;
  listing?: PluginStoreListing;
  raw: Record<string, unknown>;
}

interface PluginManifestRead {
  manifest: PluginManifest;
  manifestPath?: string;
}

interface PluginRootInput {
  entry: MarketplacePluginEntry;
  marketplace: string;
  rootPath: string;
}

export function isAccountOnlyPlugin(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const raw = isRecord(value.raw) ? value.raw : value;
  const listing = isRecord(value.listing) ? value.listing : undefined;
  const servers = isRecord(raw.mcpServers) ? raw.mcpServers : {};
  return (
    raw.requiresPaidPlan === true ||
    listing?.requiresPaidPlan === true ||
    Object.values(servers).some(
      (server) =>
        isRecord(server) && isRecord(server.auth) && server.auth.type === ACCOUNT_AUTH_TYPE,
    )
  );
}

// 市场条目可能只有 source；必须读取与运行时同源的 MCP 定义，避免安装后才禁用账号插件。
export function isAccountOnlyPluginAtRootSync(input: PluginRootInput): boolean {
  const loaded = toLoadedPlugin(input, readPluginManifestFromRoot(input.rootPath, input.entry));
  return (
    isAccountOnlyPlugin(loaded.manifest) ||
    isAccountOnlyPlugin({
      mcpServers: loadPluginMcpServerDefinitions({ diagnostics: [], loaded }),
    })
  );
}

export async function isAccountOnlyPluginAtRoot(input: PluginRootInput): Promise<boolean> {
  const loaded = toLoadedPlugin(input, await readPluginManifestFromRootAsync(input));
  return (
    isAccountOnlyPlugin(loaded.manifest) ||
    isAccountOnlyPlugin({
      mcpServers: await loadPluginMcpServerDefinitionsAsync({ diagnostics: [], loaded }),
    })
  );
}

function toLoadedPlugin(input: PluginRootInput, read: PluginManifestRead | null): LoadedPlugin {
  return {
    id: `${input.entry.name}@${input.marketplace}`,
    marketplace: input.marketplace,
    rootPath: input.rootPath,
    source: "cache",
    manifest: read?.manifest ?? { name: input.entry.name },
    manifestPath: read?.manifestPath ?? input.rootPath,
  };
}

export function findPluginManifestPath(rootPath: string): string | null {
  for (const candidate of MANIFEST_PATHS) {
    const path = join(rootPath, candidate);
    if (fileExists(path)) return path;
  }
  return null;
}

export function readPluginManifestFromRoot(
  rootPath: string,
  entry: MarketplacePluginEntry,
): PluginManifestRead | null {
  const manifestPath = findPluginManifestPath(rootPath);
  return manifestPath
    ? parsePluginManifest(JSON.parse(readFileSync(manifestPath, "utf8")), manifestPath)
    : syntheticManifest(entry);
}

async function readPluginManifestFromRootAsync(
  input: PluginRootInput,
): Promise<PluginManifestRead | null> {
  for (const candidate of MANIFEST_PATHS) {
    const path = join(input.rootPath, candidate);
    let content: string;
    try {
      content = await readFile(path, "utf8");
    } catch (error) {
      if (isNotFoundError(error)) continue;
      throw error;
    }
    return parsePluginManifest(JSON.parse(content), path);
  }
  return syntheticManifest(input.entry);
}

function parsePluginManifest(parsed: unknown, manifestPath: string): PluginManifestRead {
  if (!isRecord(parsed)) throw new Error("Plugin manifest must be a JSON object");
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  if (!PLUGIN_NAME_PATTERN.test(name)) throw new Error(`Invalid plugin name: ${name}`);
  return {
    manifest: {
      ...parsed,
      name,
      version: typeof parsed.version === "string" ? parsed.version : DEFAULT_PLUGIN_VERSION,
    } as PluginManifest,
    manifestPath,
  };
}

function syntheticManifest(entry: MarketplacePluginEntry): PluginManifestRead | null {
  return entry.strict === false
    ? { manifest: createManifestFromMarketplaceEntry(entry) as unknown as PluginManifest }
    : null;
}

export function createManifestFromMarketplaceEntry(
  entry: MarketplacePluginEntry,
): Record<string, unknown> {
  const raw = { ...entry.raw };
  delete raw.source;
  delete raw.category;
  delete raw.tags;
  delete raw.strict;
  // 商店展示元数据不属于插件 manifest；author/homepage 是合法 manifest 字段，仍保留。
  delete raw.displayName;
  delete raw.displayName_i18n;
  delete raw.description_i18n;
  delete raw.icon;
  delete raw.privacyPolicy;
  delete raw.termsOfService;
  delete raw.heroImage;
  delete raw.examplePrompts;
  delete raw.examplePrompts_i18n;
  delete raw.requiresPaidPlan;
  return {
    ...raw,
    name: entry.name,
    version: entry.version ?? DEFAULT_PLUGIN_VERSION,
  };
}
