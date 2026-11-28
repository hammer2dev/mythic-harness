import { useEffect, useRef, useState } from "react";
import type {
  AgentApplicationView,
  IAgentApplicationsService,
} from "@zcode/shared/agent-applications";
import { useBaseWorkspaceServices } from "./useWorkspaceServices.js";

type PendingAction = "scan" | "readModels" | "change";

export function useAgentApplications() {
  const { agentApplicationsService: service } = useBaseWorkspaceServices();
  const [apps, setApps] = useState<readonly AgentApplicationView[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const testing = useRef<{ id: string | null }>({ id: null });

  useEffect(() => {
    if (!service) return;
    const active = testing.current;
    let disposed = false;
    void service.list(true).then(
      (rows) => {
        if (!disposed) {
          setApps(rows);
          setLoading(false);
        }
      },
      (cause: unknown) => {
        if (!disposed) {
          setError(cause instanceof Error ? cause.message : "");
          setLoading(false);
        }
      },
    );
    return () => {
      disposed = true;
      if (active.id) void service.cancelTest(active.id).catch(() => undefined);
    };
  }, [service]);

  async function execute<T>(
    action: (service: IAgentApplicationsService) => Promise<T>,
    kind: PendingAction = "change",
  ) {
    if (!service || running.current) return;
    running.current = true;
    setPendingAction(kind);
    setError(null);
    try {
      return await action(service);
    } catch (cause) {
      if (!(cause instanceof Error && cause.name === "AbortError"))
        setError(cause instanceof Error ? cause.message : "");
    } finally {
      running.current = false;
      setPendingAction(null);
    }
  }

  function update(app: AgentApplicationView) {
    setApps((current) =>
      current.some(({ id }) => id === app.id)
        ? current.map((item) => (item.id === app.id ? app : item))
        : [...current, app],
    );
  }

  async function mutate(
    action: (api: IAgentApplicationsService) => Promise<AgentApplicationView>,
    kind?: PendingAction,
  ) {
    const result = await execute(action, kind);
    if (result) update(result);
    return result;
  }

  return {
    apps,
    available: Boolean(service),
    loading: Boolean(service) && loading,
    busy: pendingAction !== null,
    scanning: pendingAction === "scan",
    readingModels: pendingAction === "readModels",
    error,
    clearError: () => setError(null),
    async scan() {
      const result = await execute((api) => api.list(true), "scan");
      if (result) setApps(result);
      return result;
    },
    mutate,
    readModels: (id: string) => mutate((api) => api.readModels(id), "readModels"),
    async remove(id: string) {
      const result = await execute(async (api) => {
        await api.remove(id);
        return api.list();
      });
      if (result) setApps(result);
      return result;
    },
    async test(id: string, modelId: string) {
      return execute(async (api) => {
        testing.current.id = id;
        try {
          const result = await api.test(id, modelId);
          update(result.application);
          return result;
        } finally {
          testing.current.id = null;
        }
      });
    },
    async cancelTest(id: string) {
      try {
        await service?.cancelTest(id);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "");
      }
    },
  };
}
