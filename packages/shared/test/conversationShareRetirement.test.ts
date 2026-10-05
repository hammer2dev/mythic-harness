import assert from "node:assert/strict";
import test from "node:test";
import { commandPayloadSchemas, commandTypeSchema } from "../src/zcode-protocol-v4/command.js";
import { zcodeSessionImportHistorySchema } from "../src/zcode-protocol/index.js";

test("分享下线后不再暴露导入命令或向普通输入传递分享引用", () => {
  assert.equal(commandTypeSchema.safeParse("discardSharedContext").success, false);
  assert.equal(commandTypeSchema.safeParse("sendText").success, true);
  const payload = commandPayloadSchemas.sendText.parse({
    text: "普通输入",
    context_refs: [{ kind: "shared_context_import", context_id: "fixture" }],
  });
  assert.deepEqual(payload, { text: "普通输入" });
});

test("分享历史来源下线，Claude 历史导入仍有效", () => {
  assert.equal(
    zcodeSessionImportHistorySchema.safeParse({
      source: "sharedContext",
      title: "分享示例",
      markdown: "示例内容",
      provenance: {},
    }).success,
    false,
  );
  const history = { source: "claudeCode", messages: [{ role: "user", content: "示例输入" }] };
  assert.deepEqual(zcodeSessionImportHistorySchema.parse(history), history);
});
