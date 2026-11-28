import { useState } from "react";
import type { BotProvider } from "@zcode/shared";
import { Bot } from "lucide-react";
import { BotsDialog } from "@/BotsDialog.js";
import { ProviderIcon } from "@/BotsDialog/shared.js";
import { getBotProviderRegionTagLabelId } from "@/botsUi.js";
import { Button } from "@/components/ui/button.js";
import { cn } from "@/components/lib/utils.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

const BOT_CHANNELS = [
  "weixin",
  "feishu",
  "lark",
  "telegram",
] as const satisfies readonly BotProvider[];
type BotChannel = (typeof BOT_CHANNELS)[number];

export function BotChannelSection({ className }: { className?: string }) {
  const { intl } = useZCodeIntl();
  const [entry, setEntry] = useState<{ provider: BotChannel | null } | null>(null);

  return (
    <section
      className={cn("flex min-h-0 flex-col rounded-xl border border-border bg-card p-4", className)}
    >
      <div className="mb-4 flex items-start gap-2">
        <Bot className="mt-0.5 size-4 shrink-0 text-foreground-subtle" aria-hidden="true" />
        <div className="min-w-0 space-y-1">
          <h3 className="text-ui-base font-medium text-foreground">
            {intl.formatMessage({ id: "webRemoteControl.botChannel.title" })}
          </h3>
          <p className="text-ui-base/relaxed text-remote-foreground-muted">
            {intl.formatMessage({ id: "webRemoteControl.botChannel.description" })}
          </p>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-3">
        {BOT_CHANNELS.map((provider) => {
          const regionTagLabelId = getBotProviderRegionTagLabelId(provider);
          return (
            <button
              key={provider}
              type="button"
              data-bot-channel-provider={provider}
              className="flex min-h-0 cursor-pointer items-start gap-3 rounded-lg border border-transparent bg-surface px-3 py-3 text-left transition-colors hover:border-input-border-focused hover:bg-surface-hover focus-visible:border-input-border-focused"
              onClick={() => setEntry({ provider })}
            >
              <ProviderIcon provider={provider} className="size-12 shrink-0" />
              <span className="min-w-0 flex-1 space-y-1">
                <span className="flex min-w-0 items-center gap-1.5 text-ui-base font-medium text-foreground">
                  <span className="min-w-0 truncate">
                    {intl.formatMessage({ id: `webRemoteControl.botChannel.${provider}.title` })}
                  </span>
                  {regionTagLabelId ? (
                    <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-border px-2 text-ui-xs font-medium leading-none text-remote-foreground-muted">
                      {intl.formatMessage({ id: regionTagLabelId })}
                    </span>
                  ) : null}
                </span>
                <span className="block text-ui-base/relaxed text-remote-foreground-muted">
                  {intl.formatMessage({
                    id: `webRemoteControl.botChannel.${provider}.description`,
                  })}
                </span>
                <span className="block text-ui-base font-medium text-primary">
                  {intl.formatMessage({ id: "webRemoteControl.botChannel.configure" })}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <Button
        type="button"
        variant="outline"
        size="lg"
        data-testid="web-remote-control-open-bots"
        className="mt-3 w-full gap-2 enabled:cursor-pointer"
        onClick={() => setEntry({ provider: null })}
      >
        <Bot className="size-3.5" aria-hidden="true" />
        {intl.formatMessage({ id: "webRemoteControl.botChannel.manageBots" })}
      </Button>
      <BotsDialog
        open={entry !== null}
        entryProvider={entry?.provider}
        onOpenChange={(open) => {
          if (!open) setEntry(null);
        }}
      />
    </section>
  );
}
