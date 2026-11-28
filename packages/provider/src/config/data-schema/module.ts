/**
 * Provider 数据校验模块清单。
 * 层：domain。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const providerConfigSchemaModule = {
  id: "provider-config-schema",
  requires: ["provider", "shared"],
  provides: ["provider-config-schema"],
  publicEntrypoints: ["contract.ts"],
} as const;
