import type {
  CodingPlanStaticTeamProduct,
  EnterpriseCodingPlanPricingProduct,
  ProviderFamilyDomain,
} from "@zcode/shared";
export type EnterpriseCodingPlanProductDisplay = {
  productId: string;
  productName?: string;
  productBigTitle?: string;
  tier: EnterpriseCodingPlanPricingProduct["tier"];
  subscribeMode: EnterpriseCodingPlanPricingProduct["subscribeMode"];
  subscribePeriod: EnterpriseCodingPlanPricingProduct["subscribePeriod"];
  organizationId?: string | null;
  organizationName?: string | null;
  projectId?: string | null;
  projectName?: string | null;
  teamProjects?: EnterpriseCodingPlanPricingProduct["teamProjects"];
  apiKeyStatus?: EnterpriseCodingPlanPricingProduct["apiKeyStatus"];
  apiKeyUnavailableReason?: EnterpriseCodingPlanPricingProduct["apiKeyUnavailableReason"];
  apiKeyUnavailableMessage?: EnterpriseCodingPlanPricingProduct["apiKeyUnavailableMessage"];
  subscribed?: boolean | null;
  family?: ProviderFamilyDomain;
};

export function resolveEnterpriseCodingPlanProductFamily(
  product: Pick<EnterpriseCodingPlanProductDisplay, "family">,
): ProviderFamilyDomain {
  return product.family ?? "bigmodel";
}

function formatEnterpriseCodingPlanTier(tier: EnterpriseCodingPlanPricingProduct["tier"]): string {
  const normalized = tier.trim();
  return normalized ? normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase() : tier;
}

function buildEnterpriseCodingPlanProductList(
  products: EnterpriseCodingPlanPricingProduct[],
): EnterpriseCodingPlanProductDisplay[] {
  return products.map((product) => ({
    productId: product.productId,
    productName: formatEnterpriseCodingPlanTier(product.tier),
    productBigTitle: formatEnterpriseCodingPlanTier(product.tier),
    tier: product.tier,
    subscribeMode: product.subscribeMode,
    subscribePeriod: product.subscribePeriod,
    organizationId: product.organizationId,
    organizationName: product.organizationName,
    projectId: product.projectId,
    projectName: product.projectName,
    teamProjects: product.teamProjects,
    apiKeyStatus: product.apiKeyStatus,
    apiKeyUnavailableReason: product.apiKeyUnavailableReason,
    apiKeyUnavailableMessage: product.apiKeyUnavailableMessage,
    subscribed: product.subscribed,
  }));
}

function mergeEnterpriseCodingPlanProductList(
  staticProducts: CodingPlanStaticTeamProduct[],
  pricingProducts: EnterpriseCodingPlanPricingProduct[],
): EnterpriseCodingPlanProductDisplay[] {
  const pricingByProductId = new Map(
    pricingProducts.map((product) => [product.productId, product]),
  );
  const staticProductIds = new Set(staticProducts.map((product) => product.productId));
  const mergedStaticProducts = staticProducts.map((staticProduct) => {
    const pricingProduct = pricingByProductId.get(staticProduct.productId);
    const display = buildEnterpriseCodingPlanProductList([
      pricingProduct ?? {
        productId: staticProduct.productId,
        tier: staticProduct.tier,
        subscribeMode: staticProduct.subscribeMode,
        subscribePeriod: staticProduct.subscribePeriod,
      },
    ])[0]!;
    return {
      ...display,
      productName: staticProduct.productName,
      productBigTitle: staticProduct.productName,
    };
  });
  const subscribedPricingProducts = pricingProducts
    .filter((product) => product.subscribed === true && !staticProductIds.has(product.productId))
    .map((product) => buildEnterpriseCodingPlanProductList([product])[0]!);
  return [...mergedStaticProducts, ...subscribedPricingProducts];
}

export function resolveEnterpriseCodingPlanProductList(
  staticProducts: CodingPlanStaticTeamProduct[] | undefined,
  pricingProducts: EnterpriseCodingPlanPricingProduct[],
): EnterpriseCodingPlanProductDisplay[] {
  return !Array.isArray(staticProducts)
    ? buildEnterpriseCodingPlanProductList(pricingProducts)
    : mergeEnterpriseCodingPlanProductList(staticProducts, pricingProducts);
}
