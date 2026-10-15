import { z } from "zod";
import { toToolJsonSchema } from "./json-schema.js";

export const DEFAULT_TOOL_SEARCH_CONFIG = { schemaTokenBudget: 32_000, maxResults: 5 } as const;

export interface ToolSearchConfig {
  schemaTokenBudget: number;
  maxResults: number;
}

export const ToolSearchInputSchema = z
  .object({
    query: z
      .string()
      .trim()
      .min(1)
      .describe("Tool name, alias, or keywords describing the capability needed"),
    source: z
      .enum(["all", "builtin", "mcp"])
      .optional()
      .describe("Tool source filter; builtin tools have no MCP server"),
    server: z
      .string()
      .trim()
      .min(1)
      .nullable()
      .optional()
      .describe(
        "Exact MCP server name. Omit or use null for no server filter, including builtin searches. Tool namespaces such as functions are not MCP server names.",
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        "Maximum matches to return and activate, bounded by the configured maximum (default 5)",
      ),
  })
  .strict();

export const ToolSearchOutputSchema = z
  .object({
    matches: z.array(
      z
        .object({
          name: z.string(),
          description: z.string(),
          source: z.enum(["builtin", "mcp"]),
          server: z.string().optional(),
          status: z.enum(["loaded", "already_loaded", "budget_exceeded"]),
          estimatedTokens: z.number().int().nonnegative(),
        })
        .strict(),
    ),
    budget: z
      .object({
        limit: z.number().int().positive(),
        used: z.number().int().nonnegative(),
        resident: z.number().int().nonnegative(),
      })
      .strict(),
    message: z.string(),
  })
  .strict();

export type ToolSearchInput = z.infer<typeof ToolSearchInputSchema>;
export type ToolSearchOutput = z.infer<typeof ToolSearchOutputSchema>;
export const ToolSearchInputJsonSchema = toToolJsonSchema(ToolSearchInputSchema);
export const ToolSearchOutputJsonSchema = toToolJsonSchema(ToolSearchOutputSchema);

/** Session metadata only; never copied into the model-facing ToolSearch result. */
export const ToolExposureSnapshotSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    turn: z.number().int().nonnegative(),
    loaded: z.array(
      z
        .object({
          name: z.string().min(1),
          identity: z.string().min(1),
          lastUsed: z.number().int().nonnegative(),
          usedTurn: z.number().int().nonnegative(),
          activatedTurn: z.number().int().nonnegative(),
        })
        .strict(),
    ),
  })
  .strict();
