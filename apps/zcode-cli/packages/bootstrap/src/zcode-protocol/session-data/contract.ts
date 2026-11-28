import type { SessionStorePort } from "@zcode/contracts";
import type { SessionDataFilesPort } from "@zcode/adapters/storage";

/** 归档永久删除使用的存储与运行态。 */
export interface SessionDeletionHost {
  store: Required<
    Pick<
      SessionStorePort,
      "inspectSessionDeletions" | "beginSessionDeletion" | "completeSessionDeletion"
    >
  >;
  files: SessionDataFilesPort;
  busy(id: string): boolean;
  loaded?(id: string): boolean;
  release(id: string): Promise<void>;
  forget(id: string): void;
}
