import { SquareTerminal, X } from "lucide-react";
import { cn } from "@/components/lib/utils.js";
import { Button } from "@/components/ui/button.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { formatTerminalTabTitle } from "@/terminal/terminalPanelState.js";

export function TerminalTabTrigger({
  sessionId,
  name,
  index,
  isActive,
  onSelect,
  onClose,
}: {
  sessionId: string;
  name: string;
  index: number;
  isActive: boolean;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}) {
  const { intl } = useZCodeIntl();
  const title = formatTerminalTabTitle(name, index);
  const closeLabel = intl.formatMessage({ id: "terminal.closeTab" }, { title });
  return (
    <div
      className={cn(
        "group flex min-w-0 items-center gap-1 rounded-md pr-0.5 text-ui-caption text-foreground-subtle hover:bg-hover",
        isActive && "bg-selected text-foreground hover:bg-selected",
      )}
    >
      <button
        type="button"
        title={title}
        aria-label={title}
        aria-pressed={isActive}
        aria-controls={`terminal-pane-${sessionId}`}
        data-terminal-select={sessionId}
        className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md pl-1.5 text-left focus-visible:outline-ring"
        onClick={() => onSelect(sessionId)}
      >
        <SquareTerminal className="size-3 shrink-0" />
        <span className="flex min-w-0 items-baseline">
          <span className="min-w-0 overflow-hidden whitespace-nowrap pr-1 [mask-image:linear-gradient(to_right,black_calc(100%-0.25rem),transparent)]">
            {name}
          </span>
          {index > 1 && <span className="shrink-0 tabular-nums">{index}</span>}
        </span>
      </button>
      <Button
        type="button"
        size="icon-xs"
        variant="ghost"
        title={closeLabel}
        aria-label={closeLabel}
        className={cn(
          "shrink-0",
          !isActive &&
            "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
        )}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onClose(sessionId)}
      >
        <X className="size-3" />
      </Button>
    </div>
  );
}
