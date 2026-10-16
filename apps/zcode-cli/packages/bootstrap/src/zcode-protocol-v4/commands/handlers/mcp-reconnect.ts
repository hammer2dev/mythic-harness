import type {
  CommandEnvelope,
  CommandPayloadMap,
  CommandResult,
} from "@zcode/shared/zcode-protocol-v4";
import { requireRecord } from "../record-access.js";
import type { V4CommandCoreHost } from "../types.js";

async function reconnectMcpServer(
  host: V4CommandCoreHost,
  envelope: CommandEnvelope,
): Promise<CommandResult> {
  const record = requireRecord(host, envelope.sessionId);
  const payload = envelope.payload as CommandPayloadMap["reconnectMcpServer"];
  const persistCommand = host.recordPersistentCommandFact;
  if (!persistCommand) throw new Error("fault.command.persistentFactStoreUnavailable");
  const result = {
    type: "reconnectMcpServer" as const,
    serverName: payload.serverName,
    disposition: "queued" as const,
  };

  // 网络/OAuth 不能占住 CommandInbox 的 admission gate，否则运行中的 Stop 也会被挡住。
  await record.app.requestMcpReconnect({
    serverName: payload.serverName,
    sourceCommandId: envelope.commandId,
    expectedForegroundExecutionId: payload.expectedForegroundExecutionId,
    traceContext: record.traceContext,
    onAdmitted: async () => {
      await persistCommand.call(
        host,
        record.app.sessionId,
        "timeline",
        {
          commandId: envelope.commandId,
          status: "accepted",
          revisionAtDecision: 0,
          result,
        },
        { kind: "mcp_reconnect" },
      );
    },
  });
  return result;
}

export const mcpReconnectHandlers = { reconnectMcpServer } as const;
