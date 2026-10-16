import type {
  CommandAck,
  CommandPayloadMap,
  ConversationSnapshot,
} from "@zcode/shared/zcode-protocol-v4";

export type McpSlashCommand =
  | { kind: "reconnectMcpServer"; serverName: string; displayText: string }
  | { kind: "mcpUsage"; displayText: string };

export function parseMcpSlashCommand(text: string, hasAttachments = false): McpSlashCommand | null {
  const displayText = text.trim();
  const command = /^\/mcp(?:\s+([\s\S]*))?$/i.exec(displayText);
  if (!command) return null;
  const usage: McpSlashCommand = { kind: "mcpUsage", displayText };
  if (hasAttachments) return usage;
  const action = /^connect\s+([\s\S]+)$/i.exec(command[1]?.trim() ?? "");
  if (!action) return usage;
  const argument = action[1]!.trim();
  const quote = argument[0];
  let serverName: string;
  if (quote === '"' || quote === "'") {
    // 与现有引号参数惯例一致：只解码引号和反斜杠，保留其余字符，不解释命令或路径。
    let value = "";
    let closed = false;
    for (let index = 1; index < argument.length; index++) {
      const character = argument[index]!;
      if (character === quote) {
        if (index !== argument.length - 1) return usage;
        closed = true;
        break;
      }
      const next = argument[index + 1];
      if (character === "\\" && (next === quote || next === "\\")) {
        value += next;
        index++;
      } else {
        value += character;
      }
    }
    if (!closed) return usage;
    serverName = value.trim();
  } else {
    if (/[\s"']/.test(argument)) return usage;
    serverName = argument;
  }
  return serverName ? { kind: "reconnectMcpServer", serverName, displayText } : usage;
}

type McpReconnectIssue = "usage" | "sessionRequired" | "sessionUnavailable" | "rejected";

export async function submitMcpReconnectCommand(input: {
  command: McpSlashCommand;
  sessionId: string | null;
  snapshot: ConversationSnapshot | null;
  dispatch: (
    payload: CommandPayloadMap["reconnectMcpServer"],
    sessionId: string,
    logEpoch: string,
  ) => Promise<CommandAck>;
  notify: (issue: McpReconnectIssue, reason?: string) => void;
}): Promise<"sent" | "blocked"> {
  if (input.command.kind === "mcpUsage") {
    input.notify("usage");
    return "blocked";
  }
  if (!input.sessionId) {
    input.notify("sessionRequired");
    return "blocked";
  }
  const { snapshot } = input;
  if (!snapshot || snapshot.sessionId !== input.sessionId || !snapshot.logEpoch) {
    input.notify("sessionUnavailable");
    return "blocked";
  }
  const expectedForegroundExecutionId =
    snapshot.control.activeWorks.find((work) => work.foregroundExecutionId)
      ?.foregroundExecutionId ?? null;
  const ack = await input.dispatch(
    { serverName: input.command.serverName, expectedForegroundExecutionId },
    input.sessionId,
    snapshot.logEpoch,
  );
  if (ack.status === "accepted" || ack.status === "duplicate" || ack.status === "noop") {
    return "sent";
  }
  input.notify("rejected", ack.message ?? ack.reasonCode ?? ack.status);
  return "blocked";
}
