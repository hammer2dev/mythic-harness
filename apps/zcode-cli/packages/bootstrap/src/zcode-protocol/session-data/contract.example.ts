import type { SessionDeletionHost } from "./contract.js";

/** 无驻留会话的 CLI 进程可用既有存储端口处理归档删除。 */
export function createExampleSessionDeletionHost(
  store: SessionDeletionHost["store"],
  files: SessionDeletionHost["files"],
): SessionDeletionHost {
  return {
    store,
    files,
    busy: () => false,
    release: async () => {},
    forget: () => {},
  };
}
