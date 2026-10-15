import {
  DEFAULT_TOOL_SEARCH_CONFIG,
  type ToolSearchInput,
  type ToolSearchOutput,
} from "@zcode/contracts";

export const RESIDENT_TOOL_NAMES: ReadonlySet<string> = new Set([
  "Read",
  "Write",
  "Edit",
  "ApplyPatch",
  "Bash",
  "WebFetch",
  "WebSearch",
  "TodoRead",
  "TodoWrite",
  "EnterPlanMode",
  "ExitPlanMode",
  "AskUserQuestion",
  "SendMessage",
  "TaskStop",
  "ReadSessionContext",
  "ToolSearch",
  "Agent",
  "Skill",
  // 角色控制工具仅在既有端口和权限过滤授予资格时进入目录。
  "RespondToCoordinator",
  "submit_result",
  "escalate",
]);

export interface SearchableTool {
  name: string;
  description: string;
  capability?: string;
  aliases?: readonly string[];
  source: "builtin" | "mcp";
  server?: string;
  mcpToolName?: string;
  identity: string;
  cost: number;
}

interface LoadedTool {
  name: string;
  identity: string;
  lastUsed: number;
  usedTurn: number;
  activatedTurn: number;
}

export interface ToolExposureSnapshot {
  version: 1;
  revision: number;
  turn: number;
  loaded: LoadedTool[];
}

/** Runtime 是唯一写入者；持久化只保存身份与顺序，schema 始终来自当前 registry。 */
export class ToolExposureState {
  private loaded = new Map<string, LoadedTool>();
  private revision = 0;
  private turn = 0;
  private turnId?: string;
  disallowed: ReadonlySet<string> = new Set();

  beginTurn(turnId: string | undefined): void {
    if (turnId !== undefined && turnId !== this.turnId) {
      this.turnId = turnId;
      this.turn += 1;
      this.revision += 1;
    }
  }

  prepare(catalog: readonly SearchableTool[], turnId: string | undefined, budget: number): void {
    this.beginTurn(turnId);
    const eligible = new Map(catalog.map((tool) => [tool.name, tool]));
    for (const [name, loaded] of this.loaded) {
      // 旧会话中转为常驻的激活记录不再参与 LRU，避免裁剪时误扣不可回收的常驻成本。
      if (RESIDENT_TOOL_NAMES.has(name) || eligible.get(name)?.identity !== loaded.identity) {
        this.loaded.delete(name);
        this.revision += 1;
      }
    }
    // 模型或 schema 变化后重新执行预算；资格与当前定义优先于旧快照的保护标记。
    this.trimToBudget(this.loaded, catalog, budget, false);
  }

  exposedNames(catalog: readonly SearchableTool[]): string[] {
    return catalog
      .filter((tool) => RESIDENT_TOOL_NAMES.has(tool.name) || this.loaded.has(tool.name))
      .map((tool) => tool.name);
  }

  touch(name: string): void {
    const loaded = this.loaded.get(name);
    if (!loaded) return;
    loaded.lastUsed = ++this.revision;
    loaded.usedTurn = this.turn;
  }

  search(
    input: ToolSearchInput,
    catalog: readonly SearchableTool[],
    budget: number,
    maxResults: number = DEFAULT_TOOL_SEARCH_CONFIG.maxResults,
  ): ToolSearchOutput {
    const resident = catalog
      .filter((tool) => RESIDENT_TOOL_NAMES.has(tool.name))
      .reduce((sum, tool) => sum + tool.cost, 0);
    // 错误的服务筛选曾让内置工具持续零命中；先解释冲突，避免模型只换关键词重试。
    const filterError = validateSearchFilter(input, catalog);
    if (filterError) {
      return {
        matches: [],
        budget: { limit: budget, used: this.cost(this.loaded, catalog), resident },
        message: filterError,
      };
    }
    const matches = rankTools(input, catalog).slice(
      0,
      Math.min(input.limit ?? maxResults, maxResults),
    );
    const selected = new Map([...this.loaded].map(([name, item]) => [name, { ...item }]));
    const results: ToolSearchOutput["matches"] = [];
    let nextRevision = this.revision;
    for (const tool of matches) {
      let status: ToolSearchOutput["matches"][number]["status"];
      if (RESIDENT_TOOL_NAMES.has(tool.name) || selected.has(tool.name)) {
        status = "already_loaded";
        const loaded = selected.get(tool.name);
        if (loaded) {
          loaded.activatedTurn = this.turn;
          loaded.lastUsed = ++nextRevision;
        }
      } else {
        const candidate = new Map(selected);
        candidate.set(tool.name, {
          name: tool.name,
          identity: tool.identity,
          lastUsed: nextRevision + 1,
          usedTurn: 0,
          activatedTurn: this.turn,
        });
        this.trimToBudget(candidate, catalog, budget, true);
        if (this.cost(candidate, catalog) <= budget) {
          selected.clear();
          for (const [name, loaded] of candidate) selected.set(name, loaded);
          nextRevision += 1;
          status = "loaded";
        } else {
          status = "budget_exceeded";
        }
      }
      results.push({
        name: tool.name,
        description: tool.description.slice(0, 240),
        source: tool.source,
        ...(tool.server === undefined ? {} : { server: tool.server }),
        status,
        estimatedTokens: tool.cost,
      });
    }
    this.loaded = selected;
    this.revision = nextRevision;
    return {
      matches: results,
      budget: { limit: budget, used: this.cost(selected, catalog), resident },
      message:
        results.length === 0
          ? input.server
            ? "No eligible tools matched within the specified MCP server. Try different keywords, or omit server / set server to null to search without a server filter."
            : "No eligible tools matched. Try a different name or capability."
          : results.some((tool) => tool.status === "budget_exceeded")
            ? "Matches marked budget_exceeded were not loaded; their full schemas cannot fit the current budget."
            : "Matching tools are loaded. Use their full schemas on the next model step; execution permissions still apply.",
    };
  }

  snapshot(): ToolExposureSnapshot {
    return {
      version: 1,
      revision: this.revision,
      turn: this.turn,
      loaded: [...this.loaded.values()].map((item) => ({ ...item })),
    };
  }

  compactedSnapshot(): ToolExposureSnapshot {
    return {
      ...this.snapshot(),
      revision: this.revision + 1,
      loaded: [...this.loaded.values()]
        .filter(
          (item) => this.isProtected(item) || (item.usedTurn > 0 && item.usedTurn >= this.turn - 1),
        )
        .map((item) => ({ ...item })),
    };
  }

  restore(snapshot?: ToolExposureSnapshot, preserveTurn = false): void {
    this.loaded = new Map((snapshot?.loaded ?? []).map((item) => [item.name, { ...item }]));
    this.revision = snapshot?.revision ?? 0;
    this.turn = snapshot?.turn ?? 0;
    if (!preserveTurn) {
      this.turnId = undefined;
      this.disallowed = new Set();
    }
  }

  private isProtected(item: LoadedTool): boolean {
    return item.activatedTurn === this.turn || item.usedTurn === this.turn;
  }

  private cost(
    loaded: ReadonlyMap<string, LoadedTool>,
    catalog: readonly SearchableTool[],
  ): number {
    return catalog.reduce(
      (sum, tool) =>
        sum + (RESIDENT_TOOL_NAMES.has(tool.name) || loaded.has(tool.name) ? tool.cost : 0),
      0,
    );
  }

  private trimToBudget(
    loaded: Map<string, LoadedTool>,
    catalog: readonly SearchableTool[],
    budget: number,
    protect: boolean,
  ): void {
    const candidates = [...loaded.values()]
      .filter((item) => !protect || !this.isProtected(item))
      .sort((a, b) => a.lastUsed - b.lastUsed || a.name.localeCompare(b.name));
    let cost = this.cost(loaded, catalog);
    const costs = new Map(catalog.map((tool) => [tool.name, tool.cost]));
    for (const item of candidates) {
      if (cost <= budget) break;
      loaded.delete(item.name);
      cost -= costs.get(item.name) ?? 0;
      if (loaded === this.loaded) this.revision += 1;
    }
  }
}

function validateSearchFilter(
  input: ToolSearchInput,
  catalog: readonly SearchableTool[],
): string | undefined {
  if (!input.server) return undefined;
  if (input.source === "builtin") {
    return "Built-in tools have no MCP server. Retry with server omitted or set to null; keep source as builtin. Tool namespaces such as functions are not MCP server names.";
  }
  if (!catalog.some((tool) => tool.source === "mcp" && tool.server === input.server)) {
    return "The specified MCP server has no tools in the current eligible catalog. Check its exact name, or omit server / set server to null to search without a server filter. Tool namespaces are not MCP server names.";
  }
  return undefined;
}

const SEARCH_STOP_WORDS: ReadonlySet<string> = new Set([
  "a",
  "an",
  "the",
  "i",
  "we",
  "you",
  "to",
  "of",
  "for",
  "in",
  "on",
  "with",
  "from",
  "please",
  "want",
  "need",
  "can",
]);

function rankTools(input: ToolSearchInput, catalog: readonly SearchableTool[]): SearchableTool[] {
  const query = input.query.trim().toLowerCase();
  const words = [...new Set(tokenizeSearchText(input.query))].filter(
    (word) => !SEARCH_STOP_WORDS.has(word),
  );
  return catalog
    .filter(
      (tool) =>
        (!input.source || input.source === "all" || tool.source === input.source) &&
        (!input.server || tool.server === input.server),
    )
    .map((tool) => {
      const aliases = tool.aliases ?? [];
      const exact = [tool.name, ...aliases].some((name) => name.toLowerCase() === query);
      // MCP 规范名包含公共服务前缀；只给原工具名名称权重，避免整组服务工具挤占动作结果。
      const name = tool.source === "mcp" ? (tool.mcpToolName ?? "") : tool.name;
      const fields = [
        { words: [name, ...aliases].flatMap(tokenizeSearchText), weight: 20 },
        { words: tokenizeSearchText(tool.capability ?? ""), weight: 6 },
        { words: tokenizeSearchText(tool.description), weight: 2 },
        { words: tokenizeSearchText(tool.server ?? ""), weight: 1 },
      ];
      let coverage = 0;
      let score = 0;
      for (const word of words) {
        // 按词边界匹配并优先覆盖有效关键词，避免 a/to 等短子串压过真正能力词。
        const matchedField = fields.find((field) =>
          field.words.some(
            (candidate) => candidate === word || (word.length >= 3 && candidate.startsWith(word)),
          ),
        );
        if (matchedField) {
          coverage += 1;
          score += matchedField.weight;
        }
      }
      return { tool, exact, coverage, score };
    })
    .filter(({ exact, coverage }) => exact || coverage > 0)
    .sort(
      (a, b) =>
        Number(b.exact) - Number(a.exact) ||
        b.coverage - a.coverage ||
        b.score - a.score ||
        a.tool.name.localeCompare(b.tool.name),
    )
    .map(({ tool }) => tool);
}

function tokenizeSearchText(value: string): string[] {
  return value
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
    .replace(/([\p{Ll}\p{N}])(\p{Lu})/gu, "$1 $2")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
}
