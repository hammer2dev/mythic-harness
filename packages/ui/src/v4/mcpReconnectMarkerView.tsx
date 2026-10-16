import { ServerIcon } from "lucide-react";
import type { ZCodeMcpReconnectState } from "@zcode/shared";
import type { IntlInstance } from "@/i18n/IntlProvider.js";

const MCP_MARKER_ICON = <ServerIcon aria-hidden="true" className="size-3.5 shrink-0" />;

export function mcpReconnectMarkerView(marker: ZCodeMcpReconnectState, intl: IntlInstance) {
  const reason = marker.failureKind
    ? intl.formatMessage({ id: `settings.mcp.failure.${marker.failureKind}` })
    : marker.reason;
  return {
    icon: MCP_MARKER_ICON,
    running: marker.phase === "queued" || marker.phase === "connecting",
    label: (
      <span className="inline-flex min-w-0 flex-col items-center gap-0.5">
        <span>
          {intl.formatMessage(
            { id: `chat.mcpReconnect.phase.${marker.phase}` },
            { server: marker.serverName },
          )}
        </span>
        {marker.phase === "connected" && marker.toolCount !== undefined ? (
          <span className="text-ui-sm text-foreground-subtlest">
            {intl.formatMessage({ id: "chat.mcpReconnect.toolCount" }, { count: marker.toolCount })}
          </span>
        ) : null}
        {reason ? (
          <span className="whitespace-pre-wrap break-words text-ui-sm text-foreground-subtlest">
            {reason}
          </span>
        ) : null}
      </span>
    ),
  };
}
