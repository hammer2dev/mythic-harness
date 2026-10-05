import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getModelProviderFamilySpec,
  type CodingPlanStaticTeamProduct,
  type EnterpriseCodingPlanPricingResponse,
  type ProviderFamilyDomain,
} from "@zcode/shared";
import { useOptionalServices } from "@/hooks/useServices.js";
import { isRemoteWorkspaceDisconnectedError } from "@/lib/remoteWorkspaceServiceError.js";
import { logger } from "@/logger.js";
import {
  resolveEnterpriseCodingPlanProductList,
  type EnterpriseCodingPlanProductDisplay,
} from "@/settings/model-provider-section/enterpriseCodingPlanProducts.js";
import { normalizeCodingPlanErrorMessage } from "@/settings/model-provider-section/codingPlanError.js";

interface EnterpriseCodingPlanProductsState {
  snapshot: EnterpriseCodingPlanProductsSnapshot | null;
  loading: boolean;
  error: string | null;
}

interface EnterpriseCodingPlanProductsSnapshot {
  productList: EnterpriseCodingPlanProductDisplay[];
  raw: EnterpriseCodingPlanPricingResponse;
  authenticated: boolean;
  /** 静态目录控制可展示的团队套餐，不能用实时 pricing 补造目录中缺失的商品。 */
  staticProductIds?: string[];
}

function shouldRetainEnterprisePricingSnapshotForRefresh(
  snapshot: EnterpriseCodingPlanProductsSnapshot | null,
  authenticated: boolean,
): boolean {
  return snapshot?.authenticated === authenticated;
}

function resolveEnterprisePricingFailureSnapshot({
  currentSnapshot,
  authenticated,
  staticProducts,
  family = "bigmodel",
}: {
  currentSnapshot: EnterpriseCodingPlanProductsSnapshot | null;
  authenticated: boolean;
  staticProducts: CodingPlanStaticTeamProduct[] | undefined;
  family?: ProviderFamilyDomain;
}): EnterpriseCodingPlanProductsSnapshot | null {
  if (shouldRetainEnterprisePricingSnapshotForRefresh(currentSnapshot, authenticated)) {
    return currentSnapshot;
  }
  if (!Array.isArray(staticProducts)) {
    return null;
  }
  const raw: EnterpriseCodingPlanPricingResponse = { productList: [] };
  return {
    raw,
    productList: tagEnterpriseProductsFamily(
      resolveEnterpriseCodingPlanProductList(staticProducts, raw.productList),
      family,
    ),
    authenticated,
  };
}

/**
 * 给企业套餐展示列表打上 family 标记（zai / bigmodel）。
 * 下游可见性函数（appendSubscribedTeamPlanItems 等）需要按 family
 * 找到对应 codingPlanItem 和 team key 前缀；原列表无 family 字段，只能按
 * bigmodelCodingPlan 派生，导致 zai team plan 无法渲染。
 */
function tagEnterpriseProductsFamily(
  products: EnterpriseCodingPlanProductDisplay[],
  family: ProviderFamilyDomain,
): EnterpriseCodingPlanProductDisplay[] {
  return products.map((product) => ({ ...product, family }));
}

/**
 * 原 hook 只服务 bigmodel family，getStaticTeamProducts 硬编码
 * 读 bigmodelCodingPlan bucket、getEnterprisePricing 不传 family。
 * zai family 对称化后，hook 接受 family 参数：
 *   - 按 family 读 static bucket（zaiCodingPlan / bigmodelCodingPlan）
 *   - 传 family 给 service.getEnterprisePricing，service 据此路由到对应 provider
 * 缺省 family 时保持 bigmodel，向后兼容既有调用点。
 */
export function useEnterpriseCodingPlanProducts({
  enabled,
  authenticated,
  family = "bigmodel",
}: {
  enabled: boolean;
  authenticated: boolean;
  family?: ProviderFamilyDomain;
}) {
  const services = useOptionalServices();
  const service = services?.codingPlanSubscriptionService;
  const codingPlanProviderId = getModelProviderFamilySpec(family).individualCodingPlanProviderId;
  const [state, setState] = useState<EnterpriseCodingPlanProductsState>({
    snapshot: null,
    loading: enabled,
    error: null,
  });

  const refresh = useCallback(
    async (_options?: { force?: boolean }) => {
      if (!enabled) {
        setState((current) => ({
          snapshot: current.snapshot,
          loading: false,
          error: null,
        }));
        return;
      }
      if (!service) {
        setState({
          snapshot: null,
          loading: false,
          error: "service_unavailable",
        });
        return;
      }

      setState((current) => ({
        // 刷新时保留同一鉴权状态下的团队快照，让 loading 只反映当前请求。
        // 登录状态改变后丢弃旧快照，避免沿用另一鉴权上下文的团队权益。
        snapshot: shouldRetainEnterprisePricingSnapshotForRefresh(current.snapshot, authenticated)
          ? current.snapshot
          : null,
        loading: true,
        error: null,
      }));

      try {
        // 静态目录补充名称与权益文案，pricing 提供账户订阅和团队上下文。
        // 两条读取独立执行，静态目录缺失时仍可恢复已有 Team Plan 状态。
        const [staticResult, pricingResult] = await Promise.allSettled([
          service.getStaticTeamProducts(),
          service.getEnterprisePricing({ authenticated, family }),
        ]);
        const staticProducts =
          staticResult.status === "fulfilled"
            ? Object.prototype.hasOwnProperty.call(staticResult.value, codingPlanProviderId)
              ? staticResult.value[codingPlanProviderId]
              : undefined
            : undefined;
        const raw: EnterpriseCodingPlanPricingResponse =
          pricingResult.status === "fulfilled" ? pricingResult.value : { productList: [] };
        const pricingError = pricingResult.status === "rejected" ? pricingResult.reason : null;
        if (pricingError) {
          const message = normalizeCodingPlanErrorMessage(pricingError);
          setState((current) => ({
            // 读取失败表示当前账户状态未知；同一鉴权上下文下保留上次有效快照。
            // 没有账户快照时，才从静态目录补充只读商品说明。
            snapshot: resolveEnterprisePricingFailureSnapshot({
              currentSnapshot: current.snapshot,
              authenticated,
              staticProducts,
              family,
            }),
            loading: false,
            error: message,
          }));
          if (!isRemoteWorkspaceDisconnectedError(pricingError)) {
            logger.warn("[useEnterpriseCodingPlanProducts] 读取企业实时定价失败", {
              authenticated,
              error: message,
            });
          }
          return;
        }
        setState({
          snapshot: {
            raw,
            staticProductIds: staticProducts?.map((product) => product.productId) ?? [],
            productList: tagEnterpriseProductsFamily(
              resolveEnterpriseCodingPlanProductList(staticProducts, raw.productList),
              family,
            ),
            authenticated,
          },
          loading: false,
          error: pricingError ? normalizeCodingPlanErrorMessage(pricingError) : null,
        });
        if (
          staticResult.status === "rejected" &&
          !isRemoteWorkspaceDisconnectedError(staticResult.reason)
        ) {
          logger.warn("[useEnterpriseCodingPlanProducts] 读取团队静态配置失败，回退实时 pricing", {
            authenticated,
            error: normalizeCodingPlanErrorMessage(staticResult.reason),
          });
        }
      } catch (error) {
        const message = normalizeCodingPlanErrorMessage(error);
        // 远端 workspace 壳层会早于 attachment 绑定短暂渲染；此时断连代理报错是
        // 可预期的初始化等待态，不应伪装成 pricing 故障。真实 RPC 错误仍保留 warn。
        if (!isRemoteWorkspaceDisconnectedError(error)) {
          logger.warn("[useEnterpriseCodingPlanProducts] 读取企业 Coding Plan 套餐失败", {
            authenticated,
            error: message,
          });
        }
        setState((current) => ({
          // 团队状态读取失败时保留同一鉴权上下文的上次快照，并把错误显式交给 UI。
          // 这样可恢复的刷新失败不会被伪装成空的团队状态。
          snapshot: shouldRetainEnterprisePricingSnapshotForRefresh(current.snapshot, authenticated)
            ? current.snapshot
            : null,
          loading: false,
          error: message,
        }));
      }
    },
    [authenticated, codingPlanProviderId, enabled, family, service],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(
    () => ({
      ...state,
      refresh,
    }),
    [refresh, state],
  );
}
