import { personalProviderConfigRuleSchema } from "./contract.js";

export function exampleProviderWithSelectedModels() {
  return personalProviderConfigRuleSchema.parse({
    providerId: "personal:example",
    templateId: "example",
    config: {
      group: "standard-personal",
      inheritTemplateModels: false,
      personalModelIds: ["selected-model"],
    },
  });
}
