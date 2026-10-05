# Context compact、resume 与历史预算规范

状态：规范草案 v0.3-draft（能力状态以 IMPLEMENTATION-MAP.md 为准）

Compact 是 runtime 的受控状态转换，不是简单把旧消息截断。它必须与 active turn、queue、approval、workspaceRevision 和 verification evidence 协调。

## 1. 触发模式

支持三种触发：

| 模式         | 触发者                  | 语义                                                                             |
| ------------ | ----------------------- | -------------------------------------------------------------------------------- |
| manual       | 用户或 host             | 在下一个安全边界执行；active tool 不被中途删除                                   |
| auto         | token budget/上下文窗口 | 达到阈值后请求 compact；优先在 turn settle、tool result 写入后执行               |
| microcompact | 单次请求预算不足        | 只压缩可重建的低价值流式细节，保留当前目标、约束、pending approval 与未确认 tool |

阈值必须同时考虑模型上下文窗口、输出 reserve、系统/AGENTS 指令、工具 schema、最近 turn 和 provider 限额。不能仅按字符数裁剪。

## 2. 可保留与可重建内容

Compact snapshot 至少包含：

- 用户目标、当前 plan、已接受的约束和权限决策；
- root→cwd 的指令来源、路径与 hash/provenance；
- 当前 workspace identity、workspaceRevision、changed-file 列表和未解决冲突；
- 已完成 tool call 的输入/输出摘要及 artifact/evidence refs；
- 未完成 tool call、pending approval、child mailbox 和 backend session id；
- 最近失败、重试次数、consecutive failure breaker 状态；
- durable `SessionEvent` 的 last `sequenceNumber` 与 projectionRevision。

完整 transcript、stdout/stderr 和大文件内容可放 artifact store；provider request 仍必须在需要时带上 durable message history、context prefix、tool results 与 compact 后历史，不能假定所有长历史都只通过 ref 可用。

## 3. 与并发控制的关系

- compact 获取 `thread:<id>` exclusive permit；active turn 未到安全边界时只能排队。
- steer/queue 可以在 compact 前 admission，但必须引用同一 `baseWorkspaceRevision`；compact 完成后按 FIFO 重新注入。
- interrupt 优先级高于 compact；收到 interrupt 后先 settle tool 状态，再产生 compact skipped/cancelled 事实。
- pending approval 不得因 compact 丢失。若 provider 能恢复，保存 durable expiry 和 owner claim；否则安全默认 Abort，并将原因写入事件。
- shutdown 先停止新的 compact/turn admission，等待已启动 compact 或标记 `unknown`，不能把旧 transcript 标成 completed。

## 4. 失败与重试

Compact 失败必须保留原历史和失败原因，最多按策略重试；连续失败触发 breaker，转为 `context_exhausted`/`blocked`，等待用户或切换 backend。禁止通过无限压缩、超时或静默丢消息掩盖失败。

Resume 必须校验 session owner、workspace identity、baseWorkspaceRevision、backend capability 和 snapshot schema。无法恢复原 provider turn 时创建新的 turn，并明确记录 `backend_non_resumable`；不得伪造原 turn 已恢复。

## 5. 验收

用固定长历史 fixture 验证 manual/auto/microcompact 的边界、重复 compact 幂等、approval/child mailbox 保留、queue/steer/interrupt 顺序、provider history 组装和 compact 失败 breaker。重放事件后 projection 必须与未 compact 的 durable 事实一致。

## 规范补充：Codex compact phase 与边界

Manual/auto/microcompact 都归一化为 `session/compact` operation；不会凭空创建新的 turn。事件使用现有 `CompactStarted`、`CompactCompleted`、`CompactFailed`，payload 带 `compactionId`、`sessionId`、可选 `turnId`、`trigger`、`reason`、`phase`（PreTurn、MidTurn、PostTurn）和 summary hash。若产品需要 item projection，复用 `compact` item 类型并显式映射到上述事件，不使用未定义的 `ContextCompaction`。provider session 可复用时按 `stream_max_retries` 重试；成功后替换 history，记录 `window_number`、window ids、summary/model/reviewer hash，并按 phase 决定是否重新注入 initial context/world state。保留最后一个真实 user/summary 边界，避免把压缩摘要当作用户事实。失败须区分 Interrupted 与 TurnAborted，并写入 compact analytics。
