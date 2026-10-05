import { useMemo, useState, type CSSProperties } from "react";
import {
  TID_CHAT_CONTEXT_USAGE_TRIGGER,
  type ZCodeContextUsageBreakdownItem,
  type ZCodeProvider,
} from "@zcode/shared";
import {
  Context,
  ContextContentBody,
  ContextContent,
  ContextTrigger,
} from "@/components/ai-elements/context.js";
import { cn } from "@/components/lib/utils.js";
import { Progress } from "@/components/ui/progress.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import { formatCompactTokenNumber } from "@/lib/tokenNumberFormat.js";
type ContextUsageBreakdownSource = ZCodeContextUsageBreakdownItem["source"];

interface ContextUsageBreakdownSegment {
  chars: number;
  percent: number;
  source: ContextUsageBreakdownSource;
}

const CONTEXT_PROGRESS_TONE_COLORS = [
  "var(--color-usage-chart-1)",
  "color-mix(in oklab, var(--color-usage-chart-1) 78%, var(--color-surface))",
  "color-mix(in oklab, var(--color-usage-chart-1) 58%, var(--color-surface))",
  "color-mix(in oklab, var(--color-usage-chart-1) 42%, var(--color-surface))",
  "color-mix(in oklab, var(--color-usage-chart-1) 28%, var(--color-surface))",
] as const;
const PERCENT_MAX = 100;
const CACHE_HIT_RATE_DISPLAY_THRESHOLD = 0.78;

function formatContextUsageTokenCount(
  value: number,
  locale: string,
  options: { maximumFractionDigits?: number } = {},
): string {
  return formatCompactTokenNumber(locale, value, options);
}

function formatContextUsageSummary({
  locale,
  percent,
  size,
  used,
}: {
  locale: string;
  percent: number;
  size: number;
  used: number;
}): string {
  const percentageFormatter = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    style: "percent",
  });
  return `${formatContextUsageTokenCount(used, locale)}/${formatContextUsageTokenCount(
    size,
    locale,
    {
      maximumFractionDigits: 0,
    },
  )} (${percentageFormatter.format(percent)})`;
}

function formatContextCacheHitRateLabel(
  hitRate: number | null | undefined,
  locale: string,
  options: { showBelowThreshold?: boolean } = {},
): string | null {
  if (hitRate === null || hitRate === undefined || !Number.isFinite(hitRate)) {
    return null;
  }

  // 生产面板只露出明显缓存收益，避免低命中率分散对上下文容量的注意力；
  // 开发环境需要观察 provider 的真实低命中值，因此允许绕过 78% 展示阈值。
  if (!options.showBelowThreshold && hitRate < CACHE_HIT_RATE_DISPLAY_THRESHOLD) {
    return null;
  }

  return new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(Math.max(0, hitRate));
}

function getBreakdownToneStyle(index: number): CSSProperties {
  return {
    backgroundColor:
      CONTEXT_PROGRESS_TONE_COLORS[Math.min(index, CONTEXT_PROGRESS_TONE_COLORS.length - 1)] ??
      CONTEXT_PROGRESS_TONE_COLORS[0],
  };
}

const BREAKDOWN_SOURCE_LABEL_ID: Record<ContextUsageBreakdownSource, string> = {
  messages: "chat.contextUsage.breakdown.messages",
  system_prompt: "chat.contextUsage.breakdown.systemPrompt",
  meta_user_context: "chat.contextUsage.breakdown.metaUserContext",
  skills: "chat.contextUsage.breakdown.skills",
  tool_prompt: "chat.contextUsage.breakdown.toolPrompt",
  system_tool_schemas: "chat.contextUsage.breakdown.systemTools",
  mcp_tool_schemas: "chat.contextUsage.breakdown.mcpTools",
};

const BREAKDOWN_SOURCE_ORDER: Record<ContextUsageBreakdownSource, number> = {
  messages: 0,
  system_prompt: 1,
  meta_user_context: 2,
  skills: 3,
  tool_prompt: 4,
  system_tool_schemas: 5,
  mcp_tool_schemas: 6,
};

function buildContextUsageBreakdownSegments(
  breakdown: readonly ZCodeContextUsageBreakdownItem[] | undefined,
): ContextUsageBreakdownSegment[] {
  const charsBySource = new Map<ContextUsageBreakdownSource, number>();
  for (const item of breakdown ?? []) {
    if (!Number.isFinite(item.chars) || item.chars <= 0) {
      continue;
    }
    charsBySource.set(item.source, (charsBySource.get(item.source) ?? 0) + item.chars);
  }

  const totalChars = [...charsBySource.values()].reduce((sum, chars) => sum + chars, 0);
  if (totalChars <= 0) {
    return [];
  }

  return [...charsBySource.entries()]
    .map(([source, chars]) => ({
      chars,
      percent: chars / totalChars,
      source,
    }))
    .sort(
      (left, right) =>
        right.chars - left.chars ||
        BREAKDOWN_SOURCE_ORDER[left.source] - BREAKDOWN_SOURCE_ORDER[right.source],
    );
}

function buildContextUsageProgressSegments(segments: readonly ContextUsageBreakdownSegment[]) {
  return segments.map((segment, index) => ({
    id: segment.source,
    percent: segment.percent,
    style: getBreakdownToneStyle(index),
  }));
}

export function getRenderableTaskUsage<T extends { used: number; size: number }>(
  taskUsage: T | null,
): T | null {
  if (!taskUsage) {
    return null;
  }

  // ZCode Protocol 迁移后会单独补齐真实 contextUsed/contextWindow。
  // used=0 或非法值不代表可展示的上下文占用，避免把初始化/异常兜底渲染成误导性的 0%。
  if (
    !Number.isFinite(taskUsage.used) ||
    !Number.isFinite(taskUsage.size) ||
    taskUsage.used <= 0 ||
    taskUsage.size <= 0
  ) {
    return null;
  }

  return taskUsage;
}

export function getContextCompressionCommand(_provider: ZCodeProvider): string {
  return "/compact";
}

// 自动/运营完成（startedAt 为空）当前生效的 used_at；手动完成不进入触发器交互。

export function ChatContextUsage({
  taskUsage,
  selectedProvider: _selectedProvider,
  intl,
  locale,
}: {
  taskUsage: {
    used: number;
    size: number;
    cache?: { hitRate: number | null };
    breakdown?: ZCodeContextUsageBreakdownItem[];
  } | null;
  selectedProvider: ZCodeProvider;
  intl: ReturnType<typeof useZCodeIntl>["intl"];
  locale: string;
  onSendCompressionCommand?: (command: string) => void;
  compressionDisabled?: boolean;
}) {
  const [contextOpen, setContextOpen] = useState(false);
  const handleContextOpenChange = setContextOpen;
  const renderableTaskUsage = getRenderableTaskUsage(taskUsage);
  // 自动重置：触发器和面板复用同一完整 Personal/Team scope；共享 in-flight 避免重复请求。
  // MCP 与不足三张的主额度同排；主额度占满三列时才在下一行贯穿，浮层始终保持统一宽度。
  // 五小时与周额度各自维护撒花轨迹，避免一类完成压制另一类的触发器动效。
  // 自动/运营完成（startedAt 为空）只是播放候选；status 入口不能直接驱动 Tooltip/撒花。
  // Main 返回 claim winner 前 Composer 可能已经卸载或切换 source。现在先获取带 token
  // 的临时 reservation，只有组件与候选仍有效且即将展示时才 commit played；失效 winner release，
  // busy loser 保留 observedAt，等待真实 played 广播或 reservation 释放后重试。
  // Tooltip/撒花只消费本窗口已经 claim 成功且仍对应当前候选的 used_at。
  // 已被 hover 收起的自动完成 used_at(按类型记录)；新的自动完成 used_at 不同会自动重新展示,
  // 因此某一类型完成时无需清空另一类型的收起状态。
  // 待补播撒花的自动完成 used_at(按类型记录)；hover 展开面板后由对应额度条「已重置」位置各迸发一次。
  // 两类同时处于自动提示阶段时，优先展示更晚被观察到的那一类（更贴近“刚刚发生”）。
  // Tooltip Portal 位于 body，工作区的 opacity/inert 隐藏不了它；必须跟随 Root 的设置标签可见性。
  // 发现新的自动/运营完成：按类型重新计时合成“正在重置”,并 arm 对应额度条补播撒花。
  // 每类各自记录,一类完成不影响另一类；dismissed 按 used_at 记录,新 used_at 会自动重新展示。
  // 跨窗口"已播"广播会把正在展示的自动完成 observedAt 置空；此时已 arm 的
  // 补播撒花必须同步清除，否则本窗口 hover 面板时仍会撒花，违背“多窗口只播一次”。
  // 合成“正在重置”阶段到期后切换为“已重置”（随后一直保留直到 hover 收起）。
  // 用户 hover 触发器展开额度面板：把当前处于自动提示阶段的**每一类**都标记收起,
  // 交由面板内对应重置项从同一位置补播撒花(两类可能同时处于提示阶段)。
  const numberFormatter = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const contextUsageLabel = useMemo(() => {
    if (!renderableTaskUsage) {
      return null;
    }

    return intl.formatMessage(
      { id: "chat.contextUsage" },
      {
        used: numberFormatter.format(renderableTaskUsage.used),
        total: numberFormatter.format(renderableTaskUsage.size),
      },
    );
  }, [intl, numberFormatter, renderableTaskUsage]);
  const cacheHitRateLabel = useMemo(() => {
    return formatContextCacheHitRateLabel(renderableTaskUsage?.cache?.hitRate, locale, {
      showBelowThreshold: import.meta.env.DEV,
    });
  }, [locale, renderableTaskUsage]);
  const breakdownSegments = useMemo(
    () => buildContextUsageBreakdownSegments(renderableTaskUsage?.breakdown),
    [renderableTaskUsage?.breakdown],
  );
  const progressSegments = useMemo(
    () => buildContextUsageProgressSegments(breakdownSegments),
    [breakdownSegments],
  );
  const percentageFormatter = useMemo(
    () =>
      new Intl.NumberFormat(locale, {
        maximumFractionDigits: 1,
        style: "percent",
      }),
    [locale],
  );

  if (!renderableTaskUsage || !contextUsageLabel) {
    return null;
  }

  const usagePercent = renderableTaskUsage
    ? Math.min(Math.max(renderableTaskUsage.used / renderableTaskUsage.size, 0), 1)
    : 0;
  const compactTokenUsageLabel = renderableTaskUsage
    ? formatContextUsageSummary({
        locale,
        percent: usagePercent,
        size: renderableTaskUsage.size,
        used: renderableTaskUsage.used,
      })
    : null;
  const triggerLabel = contextUsageLabel;
  const contextUsedTokens = renderableTaskUsage?.used ?? 0;
  const contextMaxTokens = renderableTaskUsage?.size ?? 1;

  return (
    <Context
      usedTokens={contextUsedTokens}
      maxTokens={contextMaxTokens}
      open={contextOpen}
      onOpenChange={handleContextOpenChange}
    >
      <>
        {/* span 承载 ControlHintTooltip 的 asChild 锚点，内部 ContextTrigger 仍作为
                      HoverCard 触发器，避免两个 Radix 浮层在同一 DOM 上叠加 ref。手动核销的
                      processing 由弹层内「重置」按钮自身展示，触发器不转圈。 */}
        <span className="inline-flex shrink-0">
          <ContextTrigger
            aria-label={triggerLabel}
            className="text-foreground-subtle"
            data-chat-toolbar-popover-trigger="true"
            data-testid={TID_CHAT_CONTEXT_USAGE_TRIGGER}
            onPointerDown={(event) => {
              // Radix HoverCard 会在 touchstart 中阻止后续 click，手机端无法打开面板；
              // 在触摸 pointerdown 阶段先打开，桌面端继续保持原有 hover/focus 语义。
              if (
                !event.defaultPrevented &&
                event.pointerType === "touch" &&
                typeof window !== "undefined" &&
                window.matchMedia?.("(hover: none)").matches
              ) {
                // 统一走受控 open handler，确保触摸打开也会触发额度 access 刷新和刷新态反馈。
                if (!contextOpen) {
                  handleContextOpenChange(true);
                }
              }
            }}
          />
        </span>
      </>
      <ContextContent className={cn("w-80", "!rounded-xl !shadow-md")} side="top" sideOffset={2}>
        <ContextContentBody className="space-y-3">
          {/* 默认 ai-elements Header 会硬编码标题并把摘要拆到独立头部。
          工具栏上下文 hover 只需要一块紧凑信息面板，摘要和明细统一放在 body 里。 */}
          {renderableTaskUsage && compactTokenUsageLabel ? (
            <div className="space-y-2">
              <div className="flex min-w-0 mb-3 items-center gap-3">
                <span className="shrink-0 text-ui-base font-medium text-foreground">
                  {intl.formatMessage({ id: "chat.contextUsage.title" })}
                </span>
                <span className="ml-auto shrink-0 text-right font-mono text-ui-sm text-foreground-subtle">
                  {compactTokenUsageLabel}
                </span>
              </div>
              <Progress
                className="h-2 bg-surface"
                indicatorClassName="min-w-2"
                segments={progressSegments}
                value={usagePercent * PERCENT_MAX}
              />
            </div>
          ) : null}
          {renderableTaskUsage && (breakdownSegments.length > 0 || cacheHitRateLabel) ? (
            <>
              {breakdownSegments.length > 0 ? (
                <div
                  aria-label={intl.formatMessage({
                    id: "chat.contextUsage.breakdown",
                  })}
                  className="space-y-1.5"
                >
                  <div className="grid gap-1.5">
                    {breakdownSegments.map((segment, index) => (
                      <div
                        className="flex min-w-0 items-center gap-2 text-ui-sm"
                        key={segment.source}
                      >
                        <span
                          aria-hidden="true"
                          className="size-2 shrink-0 rounded-sm border border-border"
                          style={getBreakdownToneStyle(index)}
                        />
                        <span className="min-w-0 truncate text-foreground-subtle">
                          {intl.formatMessage({
                            id: BREAKDOWN_SOURCE_LABEL_ID[segment.source],
                          })}
                        </span>
                        {/* breakdown 行只展示占比，分项 token 数会和顶部总量口径混在一起造成误读。*/}
                        <span className="ml-auto min-w-10 shrink-0 text-right font-mono text-ui-sm tabular-nums text-foreground">
                          {percentageFormatter.format(segment.percent)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {cacheHitRateLabel ? (
                <div
                  className={cn(
                    "flex items-center justify-between gap-3 text-ui-sm",
                    breakdownSegments.length > 0 && "border-t border-border pt-3",
                  )}
                >
                  <span className="text-foreground-subtle">
                    {intl.formatMessage({
                      id: "chat.contextUsage.cacheHitRate",
                    })}
                  </span>
                  <span className="font-mono text-ui-sm text-foreground">{cacheHitRateLabel}</span>
                </div>
              ) : null}
            </>
          ) : null}
          {null}
          {null}
        </ContextContentBody>
      </ContextContent>
    </Context>
  );
}
