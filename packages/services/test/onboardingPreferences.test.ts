import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createOnboardingRecordService } from "../src/onboarding/onboardingRecordService.js";
import { setDataBaseDir } from "../src/paths.js";

test("未回答职业的偏好完成记录仍阻止重复引导并保留显式偏好", async () => {
  const dir = await mkdtemp(join(tmpdir(), "zcode-onboarding-preferences-"));
  setDataBaseDir(dir);
  const options = {
    loadUserId: async () => null,
    hasExistingLocalTask: async () => false,
  };
  try {
    const service = createOnboardingRecordService(options);
    assert.equal(await service.shouldOnboard("example-device"), true);
    await service.appendRecord("example-device", {
      occupation: null,
      memoryEnabled: true,
      proactiveSuggestionsEnabled: false,
      completedAt: "2026-09-30T00:00:00.000Z",
    });

    const reopened = createOnboardingRecordService(options);
    assert.equal(await reopened.shouldOnboard("example-device"), false);
    const entry = await reopened.getLatestEntry();
    assert.equal(entry?.occupation, null);
    assert.equal(entry?.memoryEnabled, true);
    assert.equal(entry?.proactiveSuggestionsEnabled, false);
    const restored = await reopened.syncSettingsFromRecord();
    assert.equal(restored?.memoryEnabled, true);
    assert.equal(restored?.proactiveSuggestionsEnabled, false);
  } finally {
    setDataBaseDir(null);
    await rm(dir, { recursive: true, force: true });
  }
});
