import { useEffect, useMemo, useRef, useState } from "react";
import { useServices } from "./useServices.js";

type CatalogState = {
  key: object;
  status: "idle" | "loading" | "success" | "error";
  ids: readonly string[];
  error?: string;
};

/** 目录是当前编辑界面的临时候选，连接变化和服务替换会使旧响应失效。 */
export function useModelCatalog({
  providerId,
  connectionKey,
  prepareConnection,
}: {
  providerId: string;
  connectionKey: string;
  prepareConnection: () => Promise<void>;
}) {
  const { providerSettingsService: service } = useServices();
  const key = useMemo(() => ({}), [providerId, connectionKey, service]);
  const [state, setState] = useState<CatalogState>({ key, status: "idle", ids: [] });
  const generation = useRef(0);
  const pending = useRef<number | null>(null);
  const current = useRef({ key, service });
  current.current = { key, service };
  useEffect(() => {
    generation.current += 1;
    pending.current = null;
    setState((previous) =>
      previous.status === "loading" || previous.key !== key
        ? { key, status: "idle", ids: [] }
        : previous,
    );
    return () => {
      generation.current += 1;
    };
  }, [key, service]);
  const load = async () => {
    // React 尚未提交 loading 的同一轮点击也必须复用进行中操作。
    if (pending.current !== null) return;
    const request = ++generation.current;
    pending.current = request;
    const isCurrent = () =>
      generation.current === request &&
      current.current.key === key &&
      current.current.service === service;
    setState({ key, status: "loading", ids: [] });
    try {
      await prepareConnection();
      if (!isCurrent()) return;
      const view = await service.getView();
      if (!isCurrent()) return;
      const ids = await service.listAvailableModels({ providerId, basedOnRevision: view.revision });
      if (isCurrent()) setState({ key, status: "success", ids });
    } catch (error) {
      // 只使用目录服务的安全摘要；连接保存的原始错误沿用原表单反馈。
      if (isCurrent())
        setState({
          key,
          status: "error",
          ids: [],
          error:
            error instanceof Error && error.message.startsWith("Model directory ")
              ? error.message
              : undefined,
        });
    } finally {
      if (pending.current === request) pending.current = null;
    }
  };
  return { ...(state.key === key ? state : { key, status: "idle" as const, ids: [] }), load };
}
