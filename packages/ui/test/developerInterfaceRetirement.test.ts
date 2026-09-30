import assert from "node:assert/strict";
import test from "node:test";
import { onboardingRecordFileSchema } from "../../shared/src/onboardingRecord.js";
import {
  getDefaultShortcutBindings,
  SHORTCUT_COMMANDS,
} from "../../shared/src/shortcutCommands.js";
import { appSettingsSchema } from "../../shared/src/validationAppSettings.js";

test("旧办公引导记录保留职业、独立偏好和完成记录，移除模式字段", () => {
  const record = onboardingRecordFileSchema.parse({
    version: 2,
    deviceMid: "example-device",
    entries: [
      {
        userId: null,
        occupation: "developer",
        interfaceMode: "office",
        memoryEnabled: true,
        proactiveSuggestionsEnabled: true,
        completedAt: "2026-09-30T00:00:00.000Z",
        uploadState: "pending",
      },
    ],
    decisions: [],
  });
  assert.equal("interfaceMode" in record.entries[0]!, false);
  assert.equal(record.entries[0]?.occupation, "developer");
  assert.equal(record.entries[0]?.memoryEnabled, true);
  assert.equal(record.entries[0]?.proactiveSuggestionsEnabled, true);
  assert.equal(record.entries[0]?.completedAt, "2026-09-30T00:00:00.000Z");
});

test("模式切换快捷键退出命令表，存量命令按未知命令忽略", () => {
  assert.equal(
    SHORTCUT_COMMANDS.some((entry) => String(entry.id) === "toggleInterfaceMode"),
    false,
  );
  assert.deepEqual(getDefaultShortcutBindings("toggleInterfaceMode"), []);
  assert.deepEqual(getDefaultShortcutBindings("toggleTerminal"), ["CmdOrCtrl+j"]);
});

test("主动任务建议新用户默认关闭，旧显式偏好继续生效", () => {
  assert.equal(appSettingsSchema.parse({}).proactiveSuggestionsEnabled === true, false);
  assert.equal(
    appSettingsSchema.parse({ proactiveSuggestionsEnabled: true }).proactiveSuggestionsEnabled,
    true,
  );
  assert.equal(
    appSettingsSchema.parse({ proactiveSuggestionsEnabled: false }).proactiveSuggestionsEnabled,
    false,
  );
});
