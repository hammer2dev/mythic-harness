# 当前设计规划审查

状态：规范草案 v0.3-draft（能力状态以 IMPLEMENTATION-MAP.md 为准）

本文件把现有 `specs/coding-first-agent/SPEC.md`、`workflow-platform` 约束和当前源码事实放在一起审查，结论是“方向正确，但需要把若干规划能力从文案改成有 owner、合同、事件和验收的实现项”。

## 1. 可以保留的方向

| 方向                      | 结论                  | 原因                                                                                 |
| ------------------------- | --------------------- | ------------------------------------------------------------------------------------ |
| native-first              | 保留                  | 当前 runtime 已有 session、queue、permission、MCP、compact、remote 和 child 生命周期 |
| coding profile            | 保留并下沉到 registry | coding-first 需要最小工具集和固定验证闭环，不能只靠 system prompt                    |
| AgentBackend 适配层       | 保留                  | 外部 Agent 不是模型 provider，必须有独立 session/process/capability 边界             |
| evidence-aware completion | 保留并提高优先级      | 当前 fail-open 语义可能虚报完成，是编码产品的硬风险                                  |
| worktree/lease 隔离       | 保留并前移            | 当前 child 复用 parent 文件系统，写入并行会直接产生冲突                              |
| protocol/projection 分离  | 保留                  | 现有 Desktop/Web/remote 对状态所有权已有明确约束，应让 coding 事件遵循同一边界       |

## 2. 需要调整的当前规划

| 当前规划或假设                                                  | 源码事实                                                       | 调整建议                                                                                                                                         |
| --------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 工具列表直接包含 ApplyPatch、GitDiff、Diagnostics               | 当前 registry 尚未全部实现                                     | 先实现 handler、权限策略和 canonical item schema；未实现工具不写入默认 profile                                                                   |
| coding turn 使用 discovering/planning/validating/reviewing 状态 | `TurnMachine` 当前没有这些持久化状态                           | phase 是从 canonical turn/tool/file/verification 事件计算的派生 projection；`phase/changed projection notification` 只是通知，不能成为第二事实源 |
| auto 自动执行低风险操作                                         | `PermissionService` 当前明确返回 `mode.auto.unimplemented`     | 实现 build policy 前保持 disabled/unsupported，并在 UI 明示                                                                                      |
| fail-open 验证可以报告完成                                      | 现有 helper 可能返回 `passed: true`                            | fail-open 只能是 `unverified`/`blocked`；completion 必须通过真实 evidence gate                                                                   |
| `SubagentPort` 直接承载 Codex/Claude/Pi                         | `SubagentPort` 是 native child runtime port                    | 用独立 external process/backend registry；parent 只消费 normalized events                                                                        |
| 只读取当前目录 AGENTS.md                                        | context discovery 需要 root→cwd、嵌套优先级、预算和 provenance | 建立 sources snapshot、LOCAL_AGENTS precedence、fallback filename 和 refresh 语义                                                                |
| 用 workspace path 作为身份 key                                  | 远程/多窗口可能复用同一路径                                    | 统一使用 `workspaceIdentity?.trim() \|\| workspacePath`；远程额外传 `remoteSessionId`                                                            |
| coding 完成后直接 review                                        | review 需要 revision、diff 和 verification evidence            | 由 reducer 生成 review item，绑定 base/current workspaceRevision 和 evidence refs                                                                |
| 所有 SessionEventType 都有强类型 payload                        | 现有 enum 与 `SessionEventPayload` 联合存在缺项                | 为缺项补 typed payload/creator/schema，或标为 legacy/projection-only；新代码不得假设完整                                                         |

## 3. 推荐的实现顺序

```mermaid
flowchart LR
  A[事件/能力合同] --> B[Native context + tools]
  B --> C[ApplyPatch + revision/CAS]
  C --> D[Evidence gate + permission/sandbox]
  D --> E[Projection + replay]
  E --> F[Subagent isolation]
  F --> G[Codex/Claude/Pi/DeepSeek adapters]
  G --> H[Benchmark + model routing]
```

顺序的约束是：没有 B/C/D，不能用外部 Agent 质量掩盖 native loop 的缺口；没有 E/F，不能把外部 Agent 设为主 session；没有 H，不做模型或 backend 的主观优劣判断。

## 4. 方案取舍

### 直接改成 codex-cli

不采用。它能快速获得 Codex 的 prompt、工具和 app-server，但会重新引入一套 session、权限、sandbox、持久化和 remote semantics，破坏 Mythic 已有协议和状态 owner。适合把 Codex 当 adapter/benchmark backend，不适合替换产品内核。

### 采用 DeepSeek Harness subagent adapter

采用其中的 adapter 思路，不搬运其 runtime。DeepSeek Harness 可以作为第一个外部 child transport 样例，但 parent/session、workspace lease、verification 和权限仍由 Mythic 持有。

### 采用统一 ACP/通用 Agent 协议

可以在 adapter 层作为可选传输，但不能把协议交集当作产品能力。ACP/CLI 往往无法统一 resume、steer、approval、structured evidence 和 worktree；能力必须在 handshake 后显式协商。

## 5. 结论

当前规划的总体方向不需要推倒重来，真正需要调整的是优先级和真实性：先完成 native coding loop 的工具、上下文、权限、证据和 replay 合同，再接 external backend；把“想要的能力”拆成可验证的事件、状态所有者和放行门槛。这样才有机会在真实仓库任务上超过 Codex/Claude，而不是只在 UI 上拥有更多 Agent 名称。

## 6. 本次复审新增的高优先级缺口

1. **编码质量策略不足**：原规范详细描述了安全、事件和恢复，但没有明确 prompt stack、模型路由、代码检索、失败分类、测试选择、repair budget 和 diff review。已拆到 `MODEL-AND-CODING-QUALITY.md`。
2. **“超过”缺少量化门槛**：`EVALS.md` 有指标，但缺少固定任务集、基线版本、重复次数、置信区间和最低放行阈值。L5 前必须定义 harness 与模型质量的分层报告，不能只比较最终成功率。
3. **接口草案存在重复**：旧示意接口已从 `REFERENCES.md` 移除；以 `AGENT-BACKENDS.md` 的 level/handshake contract 为唯一 adapter 规范。
4. **规范版本没有统一**：所有文档统一为 v0.3-draft，并通过 `DECISION-LOG.md`、`IMPLEMENTATION-MAP.md` 区分设计、合同、实现和阻塞状态。
5. **Codex/Claude 能力边界不能写成假设**：Claude SDK、Pi 协议和结构化 evidence 的具体支持必须通过运行时 handshake/fixture 确认；文档只能写接入策略，不能写成已经存在的稳定接口。

## 第二轮复审结论（v0.3-draft）

本轮已补齐唯一规范来源、能力状态标签、Hosted/Delegated 外部模式、事前写入隔离、revision 三分层、phase reducer、compact operation 归一化、native parity MVP 工具、repair budget、子 Agent DAG 和 capability-normalized benchmark。剩余源码实现缺口集中记录在 IMPLEMENTATION-MAP.md，不得在产品说明中当作已支持。
