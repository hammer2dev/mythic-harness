import type { McpConnectionSnapshot, McpPort, McpToolCatalogSnapshot } from "@zcode/contracts";

interface BorrowedSubagentMcpAccess {
  port: McpPort;
  snapshot: McpConnectionSnapshot;
}

export function createBorrowedSubagentMcpAccess(
  parentPort: McpPort,
  parentSnapshot: McpConnectionSnapshot,
  scopedServerNames?: readonly string[],
): BorrowedSubagentMcpAccess {
  const scope = scopedServerNames === undefined ? undefined : new Set(scopedServerNames);
  const isInScope = (serverName: string): boolean => scope === undefined || scope.has(serverName);
  const statuses = Object.fromEntries(
    Object.entries(parentSnapshot.statuses).filter(([serverName]) => isInScope(serverName)),
  );
  const connectedServerNames = new Set(
    Object.entries(statuses)
      .filter(([, status]) => status.status === "connected")
      .map(([serverName]) => serverName),
  );
  const snapshot: McpConnectionSnapshot = {
    statuses,
    tools: parentSnapshot.tools.filter(
      (descriptor) =>
        isInScope(descriptor.serverName) && connectedServerNames.has(descriptor.serverName),
    ),
  };
  const rejectLifecycleMutation = (): never => {
    // child 借用 parent adapter，不拥有 MCP 连接生命周期。
    throw new Error("Subagent MCP port cannot mutate parent connection lifecycle");
  };
  const getToolCatalog = (): McpToolCatalogSnapshot | undefined => {
    const catalog = parentPort.getToolCatalog?.();
    if (!catalog) return undefined;
    // 启动快照会遗漏父端口后续目录变化；只更新创建时已授予服务的定义，不扩大 child 范围。
    return {
      revision: catalog.revision,
      tools: catalog.tools.filter((descriptor) => connectedServerNames.has(descriptor.serverName)),
    };
  };

  return {
    snapshot,
    port: {
      getToolCatalog,
      async callTool(request, options) {
        if (!connectedServerNames.has(request.serverName)) {
          throw new Error(`Subagent MCP server is outside visible scope: ${request.serverName}`);
        }
        return parentPort.callTool(request, options);
      },
      async close() {
        // child 结束时不向 parent adapter 传播 close。
      },
      async connectConfiguredServers() {
        return rejectLifecycleMutation();
      },
      async connectServer() {
        return rejectLifecycleMutation();
      },
      async disconnectServer() {
        return rejectLifecycleMutation();
      },
      async listTools() {
        return [...(getToolCatalog()?.tools ?? snapshot.tools)];
      },
      async status() {
        if (!parentPort.getToolCatalog) return { ...snapshot.statuses };
        return Object.fromEntries(
          Object.entries(await parentPort.status()).filter(([serverName]) =>
            connectedServerNames.has(serverName),
          ),
        );
      },
    },
  };
}
