# Coding-first Agent：Codex 源码证据与设计映射

状态：设计参考，非实现承诺  
日期：2026-10-04

本文记录对 `F:/Project/codex/codex-rs` 的源码阅读结果。它用于解释本目录其他规范中的边界选择；不要求 Mythic 复制 Codex 的 Rust 实现、服务端协议或产品功能。

## 1. Codex 的可迁移设计

| Codex 模块                           | 观察到的职责                                                                                                                   | Mythic 应吸收的边界                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| `core`                               | turn/session、模型调用、上下文、工具、子 Agent、压缩                                                                           | 保留单一 session owner；turn、tool call、审批和恢复都以事件关联同一 run/session                       |
| `app-server`                         | RPC 请求、通知、turn admission、生命周期                                                                                       | 为 Desktop、CLI、Web 共用一个稳定的 thread/turn 协议；admission 与执行状态分开                        |
| `app-server-protocol/schema/json/v2` | `thread/start`、`turn/start`、`turn/steer`、`turn/interrupt`、`thread/fork`、`thread/resume`、`thread/compact`、审批请求与结果 | 为 AgentBackend 定义稳定协议，能力缺失时返回结构化 `unsupported`；不把 provider 原始事件直接暴露给 UI |
| `thread-store`                       | thread 元数据、分页历史、队列、附件和持久化                                                                                    | durable transcript、queue、attachment、snapshot 分开存储；历史回退不等价于回退本地文件                |
| `agent-graph-store`                  | 父子线程关系与子 Agent 图                                                                                                      | 每个子 Agent 有独立 session/owner、`parentSessionId` 和取消链，事件按 graph 关联而不是复制 transcript |
| `apply-patch`                        | 多文件 patch、上下文定位、EOF、重复/重叠 chunk、CRLF 保留                                                                      | ApplyPatch 作为编码一等工具；采用 Read→workspaceRevision/CAS→patch→atomic write→diff result 流程      |
| `exec` / `execpolicy` / `sandboxing` | 命令分类、规则、沙箱、网络和审批分层                                                                                           | 将工具风险、沙箱、审批策略和用户授权拆成独立输入，禁止一个 `mode` 字段承担全部语义                    |
| `skills`                             | 可发现、可加载的上下文能力                                                                                                     | coding profile 只加载与当前任务相关的 instructions/skills，控制 prompt 与 tool 数量                   |
| `compact`                            | 压缩前后 hook、摘要替换 durable history、初始上下文重注入、统计                                                                | compact 必须保留用户目标、工作区指令、变更摘要、失败诊断和 pending approvals，并产生可追踪事件        |

## 2. 具体源码证据

### 2.1 多层权限而非单一开关

`core/src/exec_policy.rs` 同时处理 `AskForApproval`、sandbox 权限、规则文件、危险命令和网络规则。策略匹配还区分显式 prefix rule 与启发式危险命令判断。Mythic 的 `plan/build/auto/yolo` 只能作为用户体验层名称，底层应继续分别计算：

1. 工具 capability（读、写、执行、网络、系统）；
2. 目标资源（工作区、工作树、外部路径、远端）；
3. sandbox；
4. session/project/user grant；
5. 是否需要一次性人工确认。

### 2.2 子 Agent 的继承和隔离

`core/src/codex_delegate.rs` 创建子线程时显式传入 `parent_thread_id` 和 `SubAgentSource`，继承 instructions、环境和 exec policy，并为 delegate 强制 `approval_policy=Never`。父线程通过取消 token 终止子线程，事件通过 forwarder 转发，父子 transcript 不直接双写。

Mythic 的外部 Codex/Claude/Pi 适配器应实现同等边界：只授予 adapter 声明过的能力；写入型子 Agent 使用独立 worktree 或 lease；父线程只接收结构化事件、结果和证据。

### 2.3 ApplyPatch 的一致性

`apply-patch/src/file_update.rs` 读取原文件后按 chunk 计算 replacements，支持 LF 规范化和保持原始行尾；上下文定位失败、EOF 哨兵不匹配或 patch 无法应用时返回错误，不静默覆盖。该流程与 Mythic 现有 Edit/Write 的 revision 检查相容，建议复用同一个 `FileRevision` 和 atomic commit boundary。

### 2.4 历史回退不等于代码回退

Codex 的 `ThreadRevertParams` 明确说明：回退只替换 durable conversation history，不撤销本地文件改动。Mythic 需要把 `rewind transcript`、`restore checkpoint` 和 `git/worktree revert` 设计成不同命令，UI 不能用一个“撤销”按钮混合三者。

### 2.5 压缩必须可恢复

`core/src/compact.rs` 在压缩前后运行 hooks，依据阶段决定是否重新注入初始上下文，并把摘要与窗口编号写入持久历史和 telemetry。Mythic 的 compact 结果至少应携带：`sessionId`、`turnId`、`summaryHash`、目标快照、changed files、最后一次验证失败、pending permission/tool call，以及下一步建议。

### 2.6 稳定的 turn admission

`app-server/src/turn_admission.rs` 通过短锁在“开始接收 turn”和“关闭/排空”之间建立 admission permit，permit 生命周期结束后才减少 active 数。它不把排队、执行和关闭混成一个布尔状态。Mythic 的 `CommandInbox`、owner/lease 和远程 attachment 应保留同样的 admission 边界。

## 3. 不应直接照搬的部分

- 不把 Codex 的 Responses API、ChatGPT 登录、OpenAI 专有事件或 Rust crate 结构作为 Mythic 的公共接口。
- 不假设 Claude、Pi、DeepSeek 与 Codex 具有相同的 approval、resume、steer 或 sandbox 语义；适配器必须报告能力矩阵。
- 不以“模型更强”替代 harness 的证据链。测试、lint、typecheck、build 的实际命令结果必须由工具执行记录产生。
- 不先替换现有 ZCode CLI。替换会丢失 Mythic 已有的 workflow、远程 Host、workspace identity、checkpoint 和协议兼容边界。

## 4. 映射到 Mythic 的实现合同

本节不再定义独立的 AgentBackend、BackendCapabilities 或 BackendEvent 接口。早期示意已废弃，避免与 AGENT-BACKENDS.md 的 capability level/handshake 合同产生分叉。实现唯一依据是 AGENT-BACKENDS.md、PROTOCOL-AND-REMOTE.md、现有 SessionEvent schema 和 codegen fixture；本文件只保留 Codex 源码证据与设计取舍。

## 5. Mythic 当前源码证据与已知缺口

| 当前路径                                                                             | 已确认行为                                                                                         | 设计含义                                                                  |
| ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/zcode-cli/packages/core/src/runtime/agent-runtime.ts`                          | 已有 model factory、tool registry、permission、queue、MCP、compact、subagent 和 session store 组合 | 保留为 native owner，coding profile 通过配置和事件增强                    |
| `apps/zcode-cli/packages/core/src/agent/turn-machine.ts`                             | 只有模型/工具执行 phase，没有 discovering/planning/validating/reviewing                            | coding phase 先作为 metadata/derived projection，避免文档状态机与实现冲突 |
| `apps/zcode-cli/packages/core/src/tool/handlers/index.ts`                            | `applyPatchToolEntry` 仍为注释，built-in 没有独立 ApplyPatch handler                               | Phase 1 必须新增 handler 和 contract test                                 |
| `apps/zcode-cli/packages/contracts/src/tools/apply-patch.ts`                         | 仅有 input/output/error schema                                                                     | 不能把 schema 当作已实现能力                                              |
| `apps/zcode-cli/packages/core/src/tool/path-policy.ts`                               | 当前故意不硬阻止 workspaceRoot 外路径                                                              | permission-sandbox 必须将外部路径变成显式 ask/deny/allow                  |
| `apps/zcode-cli/packages/core/src/permission/service.ts`                             | `auto` 返回 `mode.auto.unimplemented`                                                              | auto 在 policy 完整前必须 disabled；先实现有限 build 规则                 |
| `apps/zcode-cli/packages/core/src/runtime/methods/target-completion-verification.ts` | 模型 verifier 失败时调用 fail-open helper                                                          | helper 必须改成 unverified/blocked，禁止无 evidence complete              |
| `apps/zcode-cli/packages/adapters/src/context/index.ts`                              | 现有 discovery 主要按 workspace 起点读取单个优先指令来源                                           | 需要 root marker、root→cwd 多层 sources、预算、刷新和 provenance          |
| `apps/zcode-cli/packages/contracts/src/interfaces/subagent.port.ts`                  | 面向 native child 的 launch/wait/stop/sendMessage                                                  | external backend 需要独立 registry/process/session contract               |

## 6. 事件和协议实施位置

新增 coding 事件时需要同步检查：

- `apps/zcode-cli/packages/contracts/src/events/session.events.ts`；
- `packages/shared/src/zcode-protocol/index.ts`；
- `apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/` 的 normalizer、cold merge、projection 和 replay；
- `packages/desktop`、`packages/web`、`packages/ui` 的 snapshot/stream reducer；
- headless JSONL 和 SDK schema。

## 7. 外部参考

- [Codex CLI 文档](https://developers.openai.com/codex/cli/)
- Codex 本机源码：`F:/Project/codex/codex-rs/core`、`app-server`、`app-server-protocol`、`execpolicy`、`sandboxing`、`ext/agent`、`ext/queue`、`ext/skills`
- Mythic 上位规范：`specs/workflow-platform/SPEC.md`、`specs/restore-checkpoint/`、仓库根 `AGENTS.md`

上述链接和路径只作为设计旁证；实现验收以当前检出的源码、package scripts、protocol schema 和实际事件回放为准。
