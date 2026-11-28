# protocol-session-data

归档永久删除使用 `deletionPreview`、`deletionPreviewBatch` 和 `deletionExecute`。批量预检接收 `{ items }`，每批 1–100 项。结果按输入顺序返回 `{ preview }` 或 `{ error: { code } }`，遵循单项预检规则。执行使用同一 workspace 身份和预检返回的 revision，并携带 operationId。详见 [归档规格](../../../../../docs/superpowers/specs/2026-09-11-archive-management.md)。
