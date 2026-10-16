import { z } from "zod";

export const MCP_SERVER_FAILURE_KINDS = [
  "config_invalid",
  "runtime_unavailable",
  "process_start_failed",
  "network_unreachable",
  "connection_timeout",
  "protocol_negotiation_failed",
  "tool_list_failed",
  "unexpected_disconnect",
  "oauth_authorization_failed",
  "server_not_found",
  "server_unavailable",
  "rate_limited",
  "server_internal_error",
  "protocol_error",
  "status_unavailable",
  "connection_failed",
] as const;
export const mcpServerFailureKindSchema = z.enum(MCP_SERVER_FAILURE_KINDS);
export type McpServerFailureKind = z.infer<typeof mcpServerFailureKindSchema>;

export const MCP_RECONNECT_REASON_MAX_CHARS = 2000;

/** 原会话连接恢复的操作回执；连接和目录事实仍由 MCP adapter 持有。 */
export const zcodeMcpReconnectStateSchema = z
  .object({
    sourceCommandId: z.string().min(1),
    serverName: z.string().min(1),
    phase: z.enum([
      "queued",
      "connecting",
      "connected",
      "awaiting_authorization",
      "failed",
      "cancelled",
      "interrupted",
    ]),
    toolCount: z.number().int().nonnegative().optional(),
    catalogRevision: z.number().int().nonnegative().optional(),
    reason: z.string().max(MCP_RECONNECT_REASON_MAX_CHARS).optional(),
    failureKind: mcpServerFailureKindSchema.optional(),
  })
  .strict();
export type ZCodeMcpReconnectState = z.infer<typeof zcodeMcpReconnectStateSchema>;
