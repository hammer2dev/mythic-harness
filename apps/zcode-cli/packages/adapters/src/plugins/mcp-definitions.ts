import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PluginDiagnostic } from "@zcode/contracts";
import type { LoadedPlugin } from "./types.js";
import { isNotFoundError, isRecord, resolveInside } from "./helpers.js";

interface McpDefinitionInput {
  diagnostics: PluginDiagnostic[];
  loaded: LoadedPlugin;
}

type McpDefinitionSource = { path: string } | { definitions: Record<string, unknown> };
const DEFAULT_MCP_FILE = ".mcp.json";

export function loadPluginMcpServerDefinitions(input: McpDefinitionInput): Record<string, unknown> {
  return mergeDefinitions(
    definitionSources(input).map((source) => {
      if ("definitions" in source) return source.definitions;
      try {
        return normalizeMcpServersShape(JSON.parse(readFileSync(source.path, "utf8")), input);
      } catch (error) {
        return reportReadFailure(error, source.path, input);
      }
    }),
  );
}

export async function loadPluginMcpServerDefinitionsAsync(
  input: McpDefinitionInput,
): Promise<Record<string, unknown>> {
  const definitions = await Promise.all(
    definitionSources(input).map(async (source) => {
      if ("definitions" in source) return source.definitions;
      try {
        return normalizeMcpServersShape(JSON.parse(await readFile(source.path, "utf8")), input);
      } catch (error) {
        return reportReadFailure(error, source.path, input);
      }
    }),
  );
  return mergeDefinitions(definitions);
}

function mergeDefinitions(definitions: Record<string, unknown>[]): Record<string, unknown> {
  return definitions.reduce((merged, servers) => ({ ...merged, ...servers }), {});
}

function definitionSources(input: McpDefinitionInput): McpDefinitionSource[] {
  return [
    { path: join(input.loaded.rootPath, DEFAULT_MCP_FILE) },
    ...sourcesFromSpec(input.loaded.manifest.mcpServers, input),
  ];
}

function sourcesFromSpec(spec: unknown, input: McpDefinitionInput): McpDefinitionSource[] {
  if (spec === undefined) return [];
  if (typeof spec === "string") {
    const path = resolveInside(input.loaded.rootPath, spec);
    if (path) return [{ path }];
    input.diagnostics.push({
      code: "plugin_component_path_invalid",
      message: `Plugin mcpServers path escapes plugin root: ${spec}`,
      path: input.loaded.manifestPath,
      pluginId: input.loaded.id,
      severity: "error",
    });
    return [];
  }
  if (Array.isArray(spec)) return spec.flatMap((item) => sourcesFromSpec(item, input));
  return [{ definitions: normalizeMcpServersShape(spec, input) }];
}

function reportReadFailure(
  error: unknown,
  path: string,
  input: McpDefinitionInput,
): Record<string, unknown> {
  if (isNotFoundError(error)) return {};
  input.diagnostics.push({
    code: "plugin_mcp_read_failed",
    message: error instanceof Error ? error.message : `Failed to read MCP config: ${path}`,
    path,
    pluginId: input.loaded.id,
    severity: "error",
  });
  return {};
}

function normalizeMcpServersShape(
  value: unknown,
  input: McpDefinitionInput,
): Record<string, unknown> {
  if (!isRecord(value)) {
    input.diagnostics.push({
      code: "plugin_mcp_invalid",
      message: "Plugin MCP config must be an object",
      path: input.loaded.manifestPath,
      pluginId: input.loaded.id,
      severity: "error",
    });
    return {};
  }
  const servers = isRecord(value.mcpServers) ? value.mcpServers : value;
  return Object.fromEntries(Object.entries(servers).filter(([, config]) => isRecord(config)));
}
