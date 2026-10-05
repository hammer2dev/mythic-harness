import { useEffect, useState } from "react";
import type { useOnboardingRecordService } from "@/hooks/useOnboardingRecordService.js";
import { logger } from "@/logger.js";
export function useOnboardingTrigger(options: {
  onboardingRecord: ReturnType<typeof useOnboardingRecordService>;
  hasStoredOccupation: boolean;
  loadDeviceMid: () => string;
  update: unknown;
}): [boolean | null, () => void] {
  const { onboardingRecord, hasStoredOccupation, loadDeviceMid } = options;
  const [needs, setNeeds] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (!onboardingRecord) {
      setNeeds(!hasStoredOccupation);
      return;
    }
    onboardingRecord.shouldOnboard(loadDeviceMid()).then(
      (result) => {
        if (!cancelled) setNeeds(result);
      },
      (error) => {
        logger.warn("[occupation-onboarding] 引导记录读取失败", { error: String(error) });
        if (!cancelled) setNeeds(!hasStoredOccupation);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [onboardingRecord, loadDeviceMid]);
  return [needs, () => setNeeds(false)];
}
