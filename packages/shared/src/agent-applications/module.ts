/**
 * agent-applications-contract 模块清单（architecture-governance managed 模块）。
 * 层：domain。修改 requires 时同步更新 architecture-policy.yaml（检查器会校验两者一致）。
 */
export const agentApplicationsContractModule = {
  id: "agent-applications-contract",
  requires: [],
  provides: ["agent-applications-contract"],
  publicEntrypoints: ["contract.ts"],
} as const;
