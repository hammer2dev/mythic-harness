import type { ModelToolContract } from "@zcode/contracts";
import { ESTIMATED_TOKEN_CHAR_DIVISOR } from "@zcode/shared";
import { toAiSdkTools, type AiSdkToolTransformOptions } from "./tool-transform.js";

/** 复用实际 schema 转换，避免 strict/MFJS 扩展后的定义仍按原始大小占预算。 */
export function estimateAiSdkToolSchemaTokens(
  contracts: readonly ModelToolContract[],
  options: AiSdkToolTransformOptions,
): number {
  const tools = toAiSdkTools([...contracts], options);
  if (!tools) return 0;
  return Object.entries(tools).reduce((total, [name, tool]) => {
    const schema = tool.inputSchema as { jsonSchema?: unknown } | undefined;
    // toAiSdkTools 的客户端工具统一用 jsonSchema；原生工具只计声明和配置参数。
    const definition =
      tool.type === "provider"
        ? { name, type: tool.type, id: tool.id, args: tool.args }
        : {
            name,
            description: tool.description,
            inputSchema: schema?.jsonSchema,
            ...(tool.strict === undefined ? {} : { strict: tool.strict }),
            ...(tool.providerOptions ? { providerOptions: tool.providerOptions } : {}),
          };
    const text = JSON.stringify(definition);
    const chineseCharacters = text.match(/[一-鿿]/g)?.length ?? 0;
    return total + Math.ceil((text.length + chineseCharacters) / ESTIMATED_TOKEN_CHAR_DIVISOR);
  }, 0);
}
