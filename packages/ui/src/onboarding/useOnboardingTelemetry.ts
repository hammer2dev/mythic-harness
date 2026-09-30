import { useCallback, useLayoutEffect, useRef } from "react";
import type { IPlatformService } from "@zcode/shared";
import { reportAppTelemetryEvent } from "@/lib/appTelemetry.js";

type ExitAction = "start" | "skip" | "close";
type Exposure = {
  ended: boolean;
};

/** 业务选择仍由引导组件持有；这里只记录本次真实展示范围和上报去重。 */
export function useOnboardingTelemetry({
  platform,
  visible,
  memory,
  suggestions,
  migration,
}: {
  platform: Pick<IPlatformService, "reportTelemetryEvent">;
  visible: boolean;
  memory: boolean;
  suggestions: boolean;
  migration: boolean;
}) {
  const exposure = useRef<Exposure | null>(null);
  useLayoutEffect(() => {
    if (!visible) {
      exposure.current = null;
      return;
    }
    if (!exposure.current) {
      exposure.current = {
        ended: false,
      };
      void reportAppTelemetryEvent(
        platform,
        {
          elementName: "onboarding_expose",
          eventRegion: "app.onboarding",
          eventType: "expose",
          eventText: "",
          eventExtraDetail: {},
        },
        "onboardingTelemetry",
      );
    }
    // 不在 cleanup 重置：StrictMode 的 effect 重放不是一次新的产品曝光。
  }, [visible, platform]);

  return useCallback(
    (action: ExitAction, eventText: string) => {
      const current = exposure.current;
      const detail = {
        proactive_task_recommendations_enabled: String(suggestions),
        workspace_memory_enabled: String(memory),
        claude_code_history_migration_selected: String(migration),
        exit_action: action,
        exit_step: "1",
      };
      // 点击时冻结文案与答案；仅保存成功后调用，不读被 skip 改写的 settings/record。
      return () => {
        if (!current || current.ended || exposure.current !== current) return;
        current.ended = true;
        void reportAppTelemetryEvent(
          platform,
          {
            elementName: "onboarding_end",
            eventRegion: "app.onboarding",
            eventType: "ck",
            eventText,
            eventExtraDetail: detail,
          },
          "onboardingTelemetry",
        );
      };
    },
    [platform, memory, suggestions, migration],
  );
}
