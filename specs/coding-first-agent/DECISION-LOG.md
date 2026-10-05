# Coding-first 设计决策与规范分层

状态：v0.3-draft（2026-10-05）

本文件记录跨文档的强约束，避免把实现现状、接口合同和未来设想混在一起。除非后续决策明确修改，本文件中的决策优先于示例代码和旧版参考片段。

## 1. 文档状态标签

每个能力、接口和门禁都必须标注以下状态之一：

| 状态            | 含义                                  |
| --------------- | ------------------------------------- |
| `implemented`   | 当前源码已经提供并有可重复验证证据    |
| `contract-only` | 已冻结接口/事件合同，源码尚未完整实现 |
| `proposed`      | 设计方向，尚未冻结字段或迁移顺序      |
| `blocked`       | 依赖未满足，不能在产品中宣称可用      |
| `deprecated`    | 仅用于迁移兼容，禁止新增调用          |

文档中的“支持”只允许用于 `implemented`；`contract-only` 和 `proposed` 必须在 UI、prompt 和 capability handshake 中显示为不可用或实验能力。

## 2. 唯一规范来源

| 主题                                 | 唯一规范来源                                        | 其他文档的职责                      |
| ------------------------------------ | --------------------------------------------------- | ----------------------------------- |
| AgentBackend/capability/外部进程     | `AGENT-BACKENDS.md`                                 | 只给 adapter 例子和取舍             |
| SessionEvent、item、command envelope | `PROTOCOL-AND-REMOTE.md` + 当前 `session.events.ts` | RUNTIME 只说明调用时序              |
| runtime 状态所有者和 admission       | `RUNTIME.md`、`COMMAND-ADMISSION.md`                | 其他文档不得重新定义队列            |
| 文件写入、patch、revision            | `CONTEXT-AND-EDITING.md`                            | 验证文档只引用其 revision 合同      |
| evidence 和 completion gate          | `VERIFICATION-AND-PERMISSIONS.md`                   | UX/benchmark 只消费其结果           |
| 阶段（coding phase）                 | canonical 事件的 reducer 规则（见下）               | `CodingPhaseChanged` 只能是投影通知 |

TypeScript 类型和 JSON Schema 必须从一个源生成；不再维护互相独立的示意接口。

## 3. 已冻结的关键决策

1. `AgentRuntime` 是 native session 的唯一事实源。Codex、Claude、Pi、DeepSeek 以 `AgentBackend` 接入，不能把 `zcode-cli` 直接替换成另一个 CLI。
2. external implement 只有两条合法写入路径：运行在独立 worktree，或所有写入经由受控 FS proxy/tool server。真实 sandbox 和写入 fence 必须由 executor/FS proxy 强制；diff watcher 只能发现事后变化，不能充当权限边界。无此条件的 external backend 只能 `explore/review` 或 delegated opaque session。
3. capability 采用带约束的 level，而不是一组可能失真的 boolean。handshake 必须返回 `capabilitySchemaVersion`、scope、限制和 expiry。
4. coding phase 是由 canonical item/tool/verification/turn 事件计算的派生状态。`CodingPhaseChanged` 是可丢弃的投影通知，不能单独改变 session 真相；replay/cold merge 必须能从 canonical 事件重建相同阶段。
5. wire operation 统一使用 `session/start|resume|fork|compact` 和 `turn/start|steer|interrupt|queue`。runtime 内部保留 `turn/compact` 等旧别名时，必须在入口归一化为同一个 operation 和同一组 correlation 字段。
6. `logRevision`、`workspaceRevision`、`gitRevision` 三者分开传输：前者用于 CommandInbox CAS，第二者用于文件/evidence CAS，第三者用于 Git 基线和展示，禁止裸写 `revision`。
7. Host/relay 可以缓存 snapshot 和事件游标，但 snapshot 的业务事实由 runtime/session store 持有；Host/relay 不拥有 task queue、transcript、verification 或 workspace diff。
8. 交付采用垂直切片。每个切片同时交付工具、context、prompt、verification、UX 和 benchmark fixture；协议完备度不能替代 patch correctness。

## 4. 当前最小能力基线

Native coding MVP 必须同时提供 `Read`、`Glob`、`Grep`、`Edit`、`Write`、`ApplyPatch`、持久 terminal/process、`GitStatus`、`GitDiff`、结构化 `Diagnostics`、test discovery 和 targeted test 执行。没有这些能力时只能标记为探索版，不能宣称达到 Codex/Claude 的 coding-first 水平。

## 5. 开放问题（实现前必须补证据）

- `ApplyPatch` parser 的 binary、symlink、权限位和 mixed line ending fixture；
- Windows junction/ACL、macOS sandbox、Linux symlink/network 的 executor 适配；
- 各 external backend 的真实协议版本、resume 语义和 approval bridge；
- capability-normalized benchmark 的任务样本量与人工评分一致性。
