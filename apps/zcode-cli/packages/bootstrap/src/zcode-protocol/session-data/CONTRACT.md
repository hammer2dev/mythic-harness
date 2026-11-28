# cli-session-data

归档会话永久删除提供 `deletionPreview`、`deletionPreviewBatch` 和 `deletionExecute`。预检返回版本、受影响的会话树、保留的 fork 和附件及阻断原因。执行携带完整 workspace 身份、revision 和 operationId，结果状态为 deleted、blocked 或 incomplete。共享附件保留文件，准入凭据与写屏障支持重试并阻止旧索引复活。详见归档规格与 CLI persistence spec。
