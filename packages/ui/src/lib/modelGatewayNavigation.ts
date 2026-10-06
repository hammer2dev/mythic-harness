const OPEN_MODEL_GATEWAY_EVENT = "zcode:open-model-gateway";

export type ModelGatewaySection = "modelProvider" | "usage";

export interface ModelGatewayOpenTarget {
  section: ModelGatewaySection;
  providerId?: string;
}

let pendingTarget: ModelGatewayOpenTarget | null = null;

/** 显式模型导航的统一入口；App 负责消费目标并写入导航历史。 */
export function requestModelGatewayOpen(
  target: ModelGatewayOpenTarget = { section: "modelProvider" },
): void {
  pendingTarget = { ...target };
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<ModelGatewayOpenTarget>(OPEN_MODEL_GATEWAY_EVENT, { detail: pendingTarget }),
  );
}

export function consumeModelGatewayOpenTarget(): ModelGatewayOpenTarget | null {
  const target = pendingTarget;
  pendingTarget = null;
  return target;
}

export function addModelGatewayOpenListener(
  listener: (target: ModelGatewayOpenTarget) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const handleOpen = (event: Event) => {
    listener((event as CustomEvent<ModelGatewayOpenTarget>).detail);
  };
  window.addEventListener(OPEN_MODEL_GATEWAY_EVENT, handleOpen);
  return () => window.removeEventListener(OPEN_MODEL_GATEWAY_EVENT, handleOpen);
}
