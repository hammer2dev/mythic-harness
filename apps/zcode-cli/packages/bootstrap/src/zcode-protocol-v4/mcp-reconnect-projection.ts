import type { McpReconnectUpdatedPayload, SessionEvent } from "@zcode/contracts";

/** MCP 控制记录只借用真实轮锚点，不创建模型轮或工具调用。 */
export function normalizeMcpReconnectEvent(event: SessionEvent, productTurnId?: string) {
  const payload = event.payload as McpReconnectUpdatedPayload;
  const anchorTurnId = payload.anchorTurnId ? String(payload.anchorTurnId) : "";
  return {
    semanticKind: "passthrough",
    event,
    entityId: `mcp-reconnect:${payload.state.sourceCommandId}`,
    sourceCommandId: payload.state.sourceCommandId,
    productTurnId: anchorTurnId ? (productTurnId ?? anchorTurnId) : "",
    runtimeTurnId: anchorTurnId,
    transcriptMessageId: null,
    visibility: "visible",
    origin: "system",
    placement: {
      lane: "lightBoundary",
      relation: anchorTurnId ? "withinProductTurn" : "none",
    },
    diagnostics: [],
  } as const;
}
