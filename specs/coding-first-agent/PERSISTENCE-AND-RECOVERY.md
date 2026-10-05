# Persistence、Snapshot 与恢复规范

状态：规范草案 v0.3-draft（能力状态以 IMPLEMENTATION-MAP.md 为准）

## 1. 存储分层

| 数据                 | 存储                            | 语义                                                                       |
| -------------------- | ------------------------------- | -------------------------------------------------------------------------- |
| SessionEvent durable | session event store             | 事实源，按 `sequenceNumber` 追加，支持查询和重放                           |
| transient stream     | retention buffer/topic          | ModelStreaming、ToolCallProgress 等可淘汰，保留 watermark 和最终状态       |
| command index        | CommandInbox + durable lookup   | commandId 幂等、accepted/final ack、baseLogRevision、discarded 状态        |
| snapshot/projection  | session snapshot store          | 加速恢复，不取代事件；必须带 last sequence/watermark 和 schema version     |
| artifact             | artifact store                  | stdout/stderr、diff、patch、diagnostics、verification 输出；按引用关联事件 |
| child graph          | subagent registry/session store | parent edge、agent path、mailbox、backend/process metadata                 |

## 2. 事件与快照

事件 store 以现有 `SessionEvent` 字段和 `sequenceNumber` 为准。snapshot 记录：session/turn 状态、当前 workspace identity/workspaceRevision、last logRevision 和 gitRevision、coding phase、pending interactions、queue summaries、child summaries、last durable sequence、transient watermark、schema version 和 compact hash。

快照落后或损坏时从 durable event 重建。transient event 缺失不视为事实缺失；若 durable sequence 有 gap，则返回 `replay_gap` 并重新请求 snapshot，而不是静默跳过。

## 3. Tool call 与 command recovery

每个 tool call 状态为 `requested → started → completed|failed|cancelled|unknown`。恢复时：

- `completed/failed/cancelled` 不重放；
- 只有 `requested` 且没有 execution side effect 的调用可以按 policy 重建；
- `started` 没有终态的写入、shell 或外部 backend 调用标为 `unknown`，等待用户或 backend 明确策略；
- commandId duplicate 共享原 final promise/ack，settled 结果从 transcript/timeline/child/discarded lookup 恢复。

## 4. Checkpoint、rewind、fork

三种操作必须分开：

1. `rewind transcript`：改变可见历史 projection，不撤销文件。
2. `restore checkpoint`：恢复指定 session/runtime snapshot，并重新校验 workspaceRevision、owner/lease 和 pending requests。
3. `git/worktree revert`：真实修改文件，由 FileSystem/lease/permission 决定。

fork 生成新 sessionId、parentSessionId 和独立 command namespace；transcript 可以从逻辑快照开始，但文件写入必须新建 worktree 或重新获得 lease。

## 5. Compact

compact 追加 `started/completed/failed` 事件，摘要必须包含目标、有效指令 provenance、changed files/revisions、verification evidence、失败、pending interaction、child refs、下一步和 summary hash。摘要替换 history 后保留原始 event range 引用，支持审计和必要时重新展开。

## 6. Schema migration

新增 SessionEventType、payload 字段、protocol item 或 backend capability 时增加 schema version 和向后读取规则。旧客户端收到未知 durable event 时保留 sequence 并显示 generic item；不能丢弃影响 turn/approval/file/verification 状态的 payload。migration 未覆盖 cold merge/replay/remote snapshot 前不得发布。

## 7. 验收

- 事件 store、snapshot、transient retention 和 artifact 引用能构成一次完整恢复。
- 进程在 tool started 后退出不会重复执行写入，用户能看到 unknown 并决定下一步。
- compact、fork、rewind、checkpoint restore 的文件和 transcript 语义互不混淆。

## 规范补充：持久序号与 live 事件

SessionEvent 的 live sink、event store 和 remote transport 使用不同序号语义：live 创建阶段可为 0，event store append 分配 persisted sequence，remote replay 使用 persisted watermark。仅持久事件参与 replay；未入 store 的 mirror/live-only 事件不可作为执行幂等依据，恢复时必须依赖 command id、artifact ref 或 snapshot。
