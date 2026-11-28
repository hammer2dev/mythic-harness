# cli-session-data-files

归档永久删除用此 adapter 枚举和删除 CLI 存储根下的会话文件。

不变量：

- 会话文件位置：`cli/{artifacts,exec,agents,sessions}/<sid>` 与 `cli/{debug,rollout}/model-io-<sid>.jsonl`。会话 ID 只接受 `[A-Za-z0-9_-]`，其余拒绝（`session-data.invalid-session-id`），不能借 ID 逃出存储根。
- 文件清单用 lstat，只计普通文件。符号链接按零字节处理，归档删除可按预检结果保留被引用的附件。删除返回实际移除文件的字节数，路径不存在按零处理。
