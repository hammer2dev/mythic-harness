import assert from "node:assert/strict";
import test from "node:test";
import type { ModelToolContract } from "@zcode/contracts";
import { estimateAiSdkToolSchemaTokens } from "./tool-schema-estimate.js";

test("工具预算统计发送字段，不计内部输出 schema 与权限元数据", () => {
  const tool = {
    name: "Example",
    description: "查询符号",
    inputSchema: { type: "object", properties: { query: { type: "string" } } },
  } as ModelToolContract;
  const decorated = {
    ...tool,
    outputSchema: { description: "x".repeat(20_000) },
    needsApproval: true,
  };
  assert.equal(
    estimateAiSdkToolSchemaTokens([tool], { providerKind: "openai-compatible" }),
    estimateAiSdkToolSchemaTokens([decorated], { providerKind: "openai-compatible" }),
  );
});

test("Anthropic strict 与兼容 provider 使用各自实际转换的 schema", () => {
  const tool = {
    name: "Example",
    strict: true,
    inputSchema: { type: "object", properties: { query: { type: "string" } } },
  } as ModelToolContract;
  const compatible = estimateAiSdkToolSchemaTokens([tool], { providerKind: "openai-compatible" });
  const strict = estimateAiSdkToolSchemaTokens([tool], {
    providerKind: "anthropic",
    modelId: "claude-sonnet-4-5-20250929",
  });
  assert.ok(compatible > 0);
  assert.ok(strict > compatible);
});
