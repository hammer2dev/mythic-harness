import { DEFAULT_TOOL_SEARCH_CONFIG, ToolExposureSnapshotSchema } from "@zcode/contracts";
import type {
  MessageWithParts,
  Model,
  ModelToolContract,
  ToolSearchInput,
  ToolSearchOutput,
  TurnId,
} from "@zcode/contracts";
import { estimateTokens } from "../../context/utils.js";
import type { AgentRuntimeInternal } from "../internal.js";
import {
  ToolExposureState,
  type SearchableTool,
  type ToolExposureSnapshot,
} from "../tool-exposure.js";

export function runtimeToolExposure(runtime: AgentRuntimeInternal): ToolExposureState {
  return (runtime.toolExposure ??= new ToolExposureState());
}

export function getExposedTools(
  runtime: AgentRuntimeInternal,
  options: {
    model?: Model;
    turnId?: TurnId;
    disallowed?: ReadonlySet<string>;
  } = {},
): ModelToolContract[] {
  const state = runtimeToolExposure(runtime);
  state.disallowed = options.disallowed ?? new Set();
  const contracts = runtime
    .getTools(options.model)
    .filter((tool) => !state.disallowed.has(tool.name));
  const catalog = buildCatalog(runtime, contracts, options.model);
  state.prepare(catalog, options.turnId, toolSchemaBudget(runtime));
  const names = new Set(state.exposedNames(catalog));
  return contracts.filter((tool) => names.has(tool.name));
}

export function searchRuntimeTools(
  runtime: AgentRuntimeInternal,
  input: ToolSearchInput,
  context: {
    model?: Model;
    turnId?: TurnId;
    abortSignal: AbortSignal;
  },
): ToolSearchOutput {
  context.abortSignal.throwIfAborted();
  const state = runtimeToolExposure(runtime);
  const contracts = runtime
    .getTools(context.model)
    .filter((tool) => !state.disallowed.has(tool.name));
  const catalog = buildCatalog(runtime, contracts, context.model);
  const budget = toolSchemaBudget(runtime);
  state.prepare(catalog, context.turnId, budget);
  return state.search(input, catalog, budget, runtime.config.toolSearch?.maxResults);
}

function buildCatalog(
  runtime: AgentRuntimeInternal,
  contracts: ModelToolContract[],
  model?: Model,
): SearchableTool[] {
  return contracts.map((tool) => {
    const entry = runtime.registry.get(tool.name);
    const mcp = entry?.metadata.mcpPresentation;
    return {
      name: tool.name,
      description: tool.description ?? "",
      capability: tool.capability,
      aliases: entry?.aliases?.filter((alias) => runtime.registry.get(alias) === entry),
      source: mcp ? "mcp" : "builtin",
      server: mcp?.serverName,
      identity: mcp
        ? JSON.stringify(["mcp", mcp.serverName, mcp.toolName])
        : `builtin:${tool.name}`,
      cost:
        model?.estimateToolSchemaTokens?.([tool]) ??
        estimateTokens(
          JSON.stringify({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
          }),
        ),
    };
  });
}

function toolSchemaBudget(runtime: AgentRuntimeInternal): number {
  return (
    runtime.config.toolSearch?.schemaTokenBudget ?? DEFAULT_TOOL_SEARCH_CONFIG.schemaTokenBudget
  );
}

/** 只消费调用方已经按 compact/rewind/fork 边界裁剪过的消息。 */
export function restoreToolExposureFromMessages(
  runtime: AgentRuntimeInternal,
  messages: readonly MessageWithParts[],
): void {
  let latest: ToolExposureSnapshot | undefined;
  const consider = (value: unknown): void => {
    const parsed = ToolExposureSnapshotSchema.safeParse(value);
    if (parsed.success && (!latest || parsed.data.revision >= latest.revision))
      latest = parsed.data;
  };
  for (const message of messages) {
    consider(message.info.metadata?.toolExposure);
    for (const part of message.parts) {
      if (part.type === "tool") consider(part.metadata?.toolExposure);
    }
  }
  runtimeToolExposure(runtime).restore(latest);
}
