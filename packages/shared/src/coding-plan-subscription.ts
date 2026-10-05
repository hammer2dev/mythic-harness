/* eslint-disable max-lines -- Coding Plan 订阅协议类型需要集中导出给 UI、services 和 RPC 共享，拆散会增加跨包类型入口复杂度。 */
import type { ProviderFamilyDomain } from "./model-provider-family.js";
import type { BUILTIN_MODEL_PROVIDER_IDS } from "./model-provider-types.js";

export type CodingPlanSubscriptionProviderId =
  | typeof BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan
  | typeof BUILTIN_MODEL_PROVIDER_IDS.zaiTeamCodingPlan
  | typeof BUILTIN_MODEL_PROVIDER_IDS.zaiStartPlan
  | typeof BUILTIN_MODEL_PROVIDER_IDS.bigmodelIndividualCodingPlan
  | typeof BUILTIN_MODEL_PROVIDER_IDS.bigmodelTeamCodingPlan
  | typeof BUILTIN_MODEL_PROVIDER_IDS.bigmodelStartPlan;
export const CODING_PLAN_SYSTEM_BUSY = "coding_plan_system_busy" as const;

export type CodingPlanUnavailableReason = "not_authenticated" | "request_failed";

export interface CodingPlanStaticTeamProduct {
  productId: string;
  productName: string;
  tier: EnterpriseCodingPlanTier;
  subscribeMode: EnterpriseCodingPlanSubscribeMode;
  subscribePeriod: EnterpriseCodingPlanSubscribePeriod;
}

export type CodingPlanStaticTeamProductsConfig = Partial<
  Record<CodingPlanSubscriptionProviderId, CodingPlanStaticTeamProduct[]>
>;


export interface ForceUpdateConfig {
  minimalVersion: string;
}

/**
 * 闲时任务客户端配置：client/configs 只下发入口曝光开关；模型展示来自 Built-in
 * offpeak Provider。准入/低峰判断仍以服务端为准（3006 兜底）。
 * 有效开启判据 = enable_offpeak_task===true 且 Built-in 模型成员非空。
 * 额度不再经 client/configs 下发；改由专用 availability 接口提供服务端即时快照。
 */

export type EnterpriseCodingPlanTier = "LITE" | "PRO" | "MAX";
export type EnterpriseCodingPlanSubscribeMode = "CONTINUOUS" | "ONE_TIME";
export type EnterpriseCodingPlanSubscribePeriod = "MONTHLY" | "QUARTERLY" | "YEARLY";

export interface EnterpriseCodingPlanPricingProduct {
  productId: string;
  tier: EnterpriseCodingPlanTier;
  subscribeMode: EnterpriseCodingPlanSubscribeMode;
  subscribePeriod: EnterpriseCodingPlanSubscribePeriod;
  subscribed?: boolean | null;
  organizationId?: string | null;
  organizationName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  teamProjects?: EnterpriseCodingPlanProjectContext[];
  apiKeyStatus?: EnterpriseCodingPlanProjectApiKeyStatus;
  apiKeyUnavailableReason?: EnterpriseCodingPlanProjectApiKeyUnavailableReason | null;
  apiKeyUnavailableMessage?: string | null;
}

export interface EnterpriseCodingPlanProjectContext {
  organizationId: string;
  organizationName?: string | null;
  projectId: string;
  projectName?: string | null;
  apiKeyStatus?: EnterpriseCodingPlanProjectApiKeyStatus;
  apiKeyUnavailableReason?: EnterpriseCodingPlanProjectApiKeyUnavailableReason | null;
  apiKeyUnavailableMessage?: string | null;
}

export type EnterpriseCodingPlanProjectApiKeyStatus = "available" | "unavailable" | "unknown";

export type EnterpriseCodingPlanProjectApiKeyUnavailableReason =
  | "no_valid_team_plan_authorization"
  | "request_failed";

export interface EnterpriseCodingPlanPricingResponse {
  productList: EnterpriseCodingPlanPricingProduct[];
}

export interface EnterpriseCodingPlanPricingRequest {
  authenticated?: boolean;
  /**
   * 指定按哪个 family 读取企业定价。
   * 缺省时按 bigmodel 处理，向后兼容既有调用点。
   * service 层据此路由到对应 family 的 subscription provider。
   */
  family?: ProviderFamilyDomain;
}
