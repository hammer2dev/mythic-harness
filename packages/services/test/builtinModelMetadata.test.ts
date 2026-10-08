import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { parseZCodeBuiltinModelConfigRules } from "@zcode/provider";

const builtin = JSON.parse(await readFile(resolve("config/provider/zcode-builtin.json"), "utf8"));
const rules = parseZCodeBuiltinModelConfigRules(builtin.config.modelConfigRules);

function model(
  modelId: string,
  apiType = "openai-responses",
  baseUrl = "https://fixture.invalid/v1",
) {
  return rules.resolve({ providerId: "fixture", modelId, apiType, baseUrl });
}

test("current models from the six vendors resolve official limits without personal configuration", () => {
  const cases = [
    ["gpt-5.5", 1050000, 128000],
    ["gpt-6-luna", 1050000, 128000],
    ["gpt-6-sol", 1050000, 128000],
    ["gpt-6.1-sol", 1050000, 128000],
    ["claude-opus-4-6", 1000000, 128000],
    ["claude-sonnet-4-5", 200000, 64000],
    ["deepseek-flash", 1048576, 393216],
    ["kimi-k3", 1048576, 1048576],
    ["MiniMax-M3", 1000000, 524288],
    ["MiniMax-M2.7", 204800, 204800],
    ["GLM-5.3-FlashX", 1000000, 131072],
  ] as const;
  for (const [id, context, output] of cases) {
    const config = model(id);
    assert.equal(config.properties?.contextWindow, context, id);
    assert.equal(config.optionSpecs?.maxOutputTokens?.max, output, id);
    assert.deepEqual(config.validateComplete(), [], id);
  }
  assert.deepEqual(model("gpt-6.1-sol").optionSpecs?.reasoningLevel?.values, [
    "low",
    "medium",
    "high",
    "xhigh",
    "max",
  ]);
  assert.deepEqual(model("claude-opus-4-6").optionSpecs?.reasoningLevel?.values, [
    "low",
    "medium",
    "high",
    "max",
  ]);
});

test("retired Kimi rules are removed and unknown versions do not inherit fabricated limits", () => {
  const raw = JSON.stringify(builtin.config.modelConfigRules);
  assert.equal(/kimi-k2(?:\\\\\.|\.)5|moonshot-v1/.test(raw), false);
  for (const id of [
    "kimi-k2.5",
    "moonshot-v1-128k",
    "gpt-6.2-sol",
    "claude-opus-5-unknown",
    "glm-5.9",
    "MiniMax-M3.2",
  ]) {
    assert.equal(model(id).properties?.contextWindow, undefined, id);
    assert.equal(model(id).optionSpecs?.maxOutputTokens?.max, undefined, id);
  }
  // 官方仍将旧 Flash ID 转发到新 Flash，保留可调用的名称。
  assert.equal(model("deepseek-v4-flash").properties?.contextWindow, 1048576);
  assert.equal(model("deepseek-v4-flash-vision-exp").optionSpecs?.maxOutputTokens?.max, 393216);
  assert.equal(model("gpt-5.3-codex-spark").properties?.contextWindow, 128000);
  assert.equal(model("gpt-5.3-codex-spark").optionSpecs?.maxOutputTokens?.max, undefined);
  assert.equal(model("kimi-k2.7-code-highspeed").optionSpecs?.maxOutputTokens?.max, undefined);
});

test("official protocol restrictions and third-party endpoint overrides stay scoped to their URL", () => {
  const officialChat = model("gpt-6-sol", "openai-chat-completions", "https://api.openai.com/v1");
  assert.deepEqual(officialChat.optionSpecs?.reasoningLevel?.values, ["none"]);
  assert.equal(
    model("gpt-6-sol", "openai-chat-completions").optionSpecs?.reasoningLevel?.values?.length,
    6,
  );
  assert.equal(
    model("gpt-6.1-sol", "openai-chat-completions", "https://api.openai.com/v1").properties
      ?.supportsToolCall,
    false,
  );
  assert.equal(
    model("deepseek-v4-pro", "anthropic-messages", "https://api.deepseek.com/anthropic").properties
      ?.supportsMidConversationSystem,
    false,
  );
  assert.equal(
    model("deepseek-flash", "anthropic-messages", "https://api.deepseek.com/anthropic").properties
      ?.supportsMidConversationSystem,
    true,
  );
  assert.equal(
    model("MiniMax-M3", "anthropic-messages", "https://opencode.ai/zen/go/v1").optionSpecs
      ?.maxOutputTokens?.max,
    131072,
  );
  assert.equal(model("MiniMax-M3", "anthropic-messages").optionSpecs?.maxOutputTokens?.max, 524288);
  assert.match(
    model("GLM-5.3-FlashX", "openai-chat-completions").optionSpecs?.reasoningLevel?.map ?? "",
    /reasoning_effort/,
  );
  assert.equal(
    model("claude-haiku-4-5-20251001", "anthropic-messages").optionSpecs?.reasoningLevel?.map,
    "{}",
  );
});
