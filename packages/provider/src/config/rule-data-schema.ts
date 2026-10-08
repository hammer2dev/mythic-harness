import { z } from "zod";
import { modelConfigDataSchema } from "@zcode/shared/model-config";
import {
  apiKeyAccessDataSchema,
  personalProviderApiDataSchema,
  providerConfigDataSchema,
  providerGroupDataSchema,
  providerTemplateDataSchema,
} from "./provider-data-schema.js";

const idSchema = z.string().min(1);
const patternSchema = z
  .string()
  .min(1)
  .refine((pattern) => {
    try {
      new RegExp(`^(?:${pattern})$`);
      return true;
    } catch {
      return false;
    }
  }, "无效匹配正则");

export const modelMatchConfigRuleSchema = z
  .object({
    modelMatch: patternSchema,
    config: modelConfigDataSchema,
  })
  .strict();
export const modelApiMatchConfigRuleSchema = modelMatchConfigRuleSchema.extend({
  apiTypeMatch: patternSchema,
});
export const providerSiteMatchConfigRuleSchema = modelMatchConfigRuleSchema.extend({
  baseUrlMatch: patternSchema,
  apiTypeMatch: patternSchema.optional(),
});
export const templateModelConfigRuleSchema = z
  .object({
    templateId: idSchema,
    modelId: idSchema,
    config: modelConfigDataSchema,
  })
  .strict();
export const providerModelConfigRuleSchema = templateModelConfigRuleSchema
  .omit({ templateId: true })
  .extend({
    providerId: idSchema,
  });

export const builtinModelConfigRulesSchema = z
  .object({
    modelRules: z.array(modelMatchConfigRuleSchema),
    modelApiRules: z.array(modelApiMatchConfigRuleSchema),
    providerSiteRules: z.array(providerSiteMatchConfigRuleSchema),
    templateModelRules: z.array(templateModelConfigRuleSchema),
    builtinProviderModelRules: z.array(providerModelConfigRuleSchema),
  })
  .strict();
export const personalModelConfigRulesSchema = z
  .object({ providerModelRules: z.array(providerModelConfigRuleSchema) })
  .strict();

// 身份、模板引用和实例名属于规则，不再成为可向执行配置叠加的叶子。
export const providerConfigRuleSchema = z
  .object({
    providerId: idSchema,
    templateId: idSchema.nullable().optional(),
    providerName: idSchema.nullable().optional(),
    enabled: z.boolean().optional(),
    config: providerConfigDataSchema,
  })
  .strict();
export const providerTemplateConfigRuleSchema = providerTemplateDataSchema.extend({
  // 模板只提供连接默认值；模型成员由用户明确添加，避免固定列表阻止删除。
  config: providerConfigDataSchema.pick({ logo: true, access: true, api: true }).extend({
    access: apiKeyAccessDataSchema.omit({ apiKey: true }).nullable().optional(),
  }),
});
export const builtinProviderConfigRuleSchema = providerConfigRuleSchema.extend({
  config: providerConfigDataSchema.omit({ personalModelIds: true, modelOrder: true }).extend({
    group: providerGroupDataSchema.exclude(["standard-personal"]),
  }),
});
const personalProviderConfigRuleSchema = providerConfigRuleSchema.extend({
  config: providerConfigDataSchema.omit({ builtinModelIds: true }).extend({
    group: providerGroupDataSchema.extract(["standard-personal"]).nullable().optional(),
    api: personalProviderApiDataSchema.nullable().optional(),
  }),
});
export const builtinProviderConfigRulesSchema = z
  .object({
    templateRules: z.array(providerTemplateConfigRuleSchema),
    providerRules: z.array(builtinProviderConfigRuleSchema),
  })
  .strict()
  .superRefine((rules, context) => {
    checkUniqueIds(
      rules.templateRules.map((rule) => rule.templateId),
      "templateRules",
      "templateId",
      context,
    );
    checkUniqueIds(
      rules.providerRules.map((rule) => rule.providerId),
      "providerRules",
      "providerId",
      context,
    );
  });
export const personalProviderConfigRulesSchema = z
  .object({
    providerRules: z.array(personalProviderConfigRuleSchema),
  })
  .strict()
  .superRefine((rules, context) => {
    checkUniqueIds(
      rules.providerRules.map((rule) => rule.providerId),
      "providerRules",
      "providerId",
      context,
    );
  });

function checkUniqueIds(
  ids: readonly string[],
  group: string,
  key: string,
  context: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  ids.forEach((id, index) => {
    if (seen.has(id))
      context.addIssue({
        code: "custom",
        path: [group, index, key],
        message: `重复 ${key}: ${id}`,
      });
    seen.add(id);
  });
}

export type ModelMatchConfigRuleData = z.infer<typeof modelMatchConfigRuleSchema>;
export type ModelApiMatchConfigRuleData = z.infer<typeof modelApiMatchConfigRuleSchema>;
export type ProviderSiteMatchConfigRuleData = z.infer<typeof providerSiteMatchConfigRuleSchema>;
export type TemplateModelConfigRuleData = z.infer<typeof templateModelConfigRuleSchema>;
export type ProviderModelConfigRuleData = z.infer<typeof providerModelConfigRuleSchema>;
export type BuiltinModelConfigRulesData = z.infer<typeof builtinModelConfigRulesSchema>;
export type PersonalModelConfigRulesData = z.infer<typeof personalModelConfigRulesSchema>;
export type ProviderConfigRuleData = z.infer<typeof providerConfigRuleSchema>;
export type ProviderTemplateConfigRuleData = z.infer<typeof providerTemplateConfigRuleSchema>;
