import { AlertTriangle } from "lucide-react";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";

export function UsageStatsErrorNotice({ error }: { error: string }) {
  const { intl } = useZCodeIntl();
  // 统计来自本地会话历史，读取失败不属于账号或模型 API 鉴权问题。
  return (
    <div className="flex w-fit min-w-0 items-center gap-1.5 text-ui-base text-destructive">
      <AlertTriangle className="size-3 shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate" title={error}>
        {intl.formatMessage({ id: "settings.usage.error" })}
      </span>
    </div>
  );
}
