/**
 * cli-session-data-files 标准调用示例：内存版端口，语义与 Node 实现一致（remove 返回删除前大小，重复删除得 0）。
 */
import type { SessionDataFilesPort } from "./contract.js";

export function createExampleSessionDataFiles(
  sessions: Record<string, number>,
): SessionDataFilesPort {
  return {
    removeSession: async (sessionId) => {
      const bytes = sessions[sessionId] ?? 0;
      delete sessions[sessionId];
      return bytes;
    },
  };
}
