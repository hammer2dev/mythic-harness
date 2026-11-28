import { MonitorSmartphone, Smartphone } from "lucide-react";
import { ControlHintTooltip } from "@/ControlHintTooltip.js";
import { Button } from "@/components/ui/button.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { BotChannelSection } from "./BotChannelSection.js";

export function WorkspaceBotChannelsTrigger() {
  const { intl } = useZCodeIntl();
  const title = intl.formatMessage({ id: "webRemoteControl.trigger" });

  return (
    <Dialog>
      <ControlHintTooltip title={title} side="right">
        <DialogTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-lg"
            data-testid="workspace-bot-channels-trigger"
            aria-label={title}
            className="size-9 text-remote-foreground-muted [app-region:no-drag] focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-foreground/60"
          >
            <Smartphone className="size-[18px]" strokeWidth={1.8} aria-hidden="true" />
          </Button>
        </DialogTrigger>
      </ControlHintTooltip>
      <DialogContent
        data-testid="bot-channels-entry-dialog"
        className="flex max-h-[calc(100dvh-2rem)] flex-col gap-4 overflow-hidden p-5 sm:max-w-lg"
      >
        <DialogHeader className="shrink-0 flex-row items-center gap-2.5 pr-8">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-surface">
            <MonitorSmartphone className="size-5" aria-hidden="true" />
          </div>
          <div className="min-w-0 space-y-1">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="text-remote-foreground-muted">
              {intl.formatMessage({ id: "webRemoteControl.botChannel.dialogDescription" })}
            </DialogDescription>
          </div>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto">
          <BotChannelSection />
        </div>
      </DialogContent>
    </Dialog>
  );
}
