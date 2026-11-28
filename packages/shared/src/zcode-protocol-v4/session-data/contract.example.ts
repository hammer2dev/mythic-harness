import type {
  V4SessionDeletionExecuteParams,
  V4SessionDeletionPreviewBatchParams,
} from "./contract.js";

export const exampleSessionDeletionPreviewBatch: V4SessionDeletionPreviewBatchParams = {
  items: [{ sessionId: "sess_1", workspace: { workspacePath: "/work/site" } }],
};

export const exampleSessionDeletionExecute: V4SessionDeletionExecuteParams = {
  sessionId: "sess_1",
  workspace: { workspacePath: "/work/site" },
  revision: "preview-revision",
  operationId: "delete-sess-1",
};
