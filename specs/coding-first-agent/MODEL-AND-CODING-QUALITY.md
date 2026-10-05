# Model、Prompt 与编码质量规范

状态：规范草案 v0.3-draft（能力状态以 IMPLEMENTATION-MAP.md 为准）

## 1. 目标

coding-first 不能只定义工具和安全边界，还必须定义 Agent 如何获得高质量代码结果。本规范负责模型路由、提示词组成、代码检索、失败恢复和结果审查；它不改变 `AgentRuntime`、PermissionService 或 FileRevision 的事实所有权。

## 2. ModelProvider 与 AgentBackend 分层

`ModelProvider` 只负责一次模型请求：消息、工具 schema、stream、usage、finish reason。`AgentBackend` 负责完整 Agent session、工具循环、审批、恢复和进程生命周期。外部 Codex/Claude/Pi/DeepSeek 不得注册成 ModelProvider。

Native coding profile 每次模型请求必须记录：provider/model、reasoning effort、context window、input/output token、tool schema hash、prompt version、instruction snapshot hash、fallback reason 和 usage。

## 3. Prompt stack

模型输入按稳定顺序组装：

1. 不可被项目文件覆盖的系统安全规则；
2. coding profile 行为合同和当前可用 capability；
3. 用户目标、验收条件和显式约束；
4. project/user instructions 及其 provenance；
5. workspace/context snapshot、目标文件和 workspaceRevision；
6. durable conversation history、compact summary、tool result 和 pending interaction；
7. 可用工具 schema 与结果格式；
8. 当前阶段、失败诊断、下一步候选和输出预算。

每次 provider request 记录 prompt sections 的 hash 和预算，避免不同 host 静默使用不同 prompt。项目指令、外部 Agent 输出和用户粘贴内容都标记为 untrusted，不能改变系统规则或权限。

## 4. 仓库理解与检索

Phase 1 使用 bounded `Read`/`Glob`/`Grep` 和 context discovery；后续按 benchmark 增加：

- package/module dependency map；
- symbol/export/reference 查询；
- AST/LSP diagnostics 和 definition/reference；
- 变更文件影响分析；
- 最近失败测试与相关源码的定向检索。

检索器必须返回 path、line range、workspaceRevision、source provenance、ranking reason 和 truncation。不能把整个仓库盲目注入 context；不能把检索结果的相关性当成事实验证。

Phase 1 parity 必须交付 package/module dependency map、import/export map、symbol/reference 查询、structured diagnostics 和失败日志定位；Phase 5 只补 AST/LSP 深度索引、复杂影响分析与更高阶 ranking。文档中的“后续”不得把上述 MVP 能力推迟到 Phase 5。

## 5. Coding loop 质量策略

每个实现任务遵循：

1. 将用户目标拆为可检查的 acceptance items；
2. 读取指令、入口、依赖和现有测试；
3. 形成短计划，并在计划中标出未知信息；
4. 先建立最小有效 diff，再运行最相关的验证；
5. 将失败归类为代码、测试、环境、权限、依赖、并发冲突或未知；
6. 只针对失败类别调整，不进行无因果重复重试；
7. 验证通过后检查 diff、未覆盖目标、API 兼容和工作区外变化；
8. 生成 evidence-backed final response。

每个 turn 有 `maxModelRounds`、`maxToolCalls`、`maxRepairAttempts`、token/time budget 和 consecutive-failure breaker。预算耗尽时状态为 `blocked`/`unverified`，不能通过继续 compact 或重复命令伪装完成。

## 6. 验证选择

验证命令按影响范围排序：受影响 package 的 targeted test → typecheck/lint → integration/build → 用户明确要求的全量检查。命令选择必须记录来源和 reason；测试选择器不能跳过用户明确要求的检查。测试失败解析器提取失败测试、文件、行号、编译错误和环境错误，回传结构化 diagnostics。

## 7. Diff 与代码审查

完成前生成 review item：目标覆盖率、changed files、added/deleted lines、workspaceRevision、验证 evidence、未解决诊断、潜在 API/行为风险。可选 review Agent 只能提出意见；最终完成仍由 parent runtime 根据 evidence 和用户目标决定。发现外部修改、未归属文件或危险 diff 时进入 `conflict`/`blocked`。

## 8. 路由与 fallback

模型路由根据任务类型、上下文大小、语言、预算、失败历史和 provider health 选择模型；路由决定必须可解释并持久化。fallback 只能在新模型能看到同一 prompt snapshot、tool schema hash、workspaceRevision 和 pending interaction 时发生；否则创建新 turn 并记录 `model_rerouted`，不能把两个模型的隐式历史拼接。

外部 Agent 的质量不能用模型路由掩盖：benchmark 报告要分开记录 harness 指标、模型指标和 backend 指标。

## 9. 验收

- 同一 prompt/profile 在 Desktop、CLI、Web 的 provider request sections 和 tool schema hash 一致。
- 测试失败后下一次工具调用与失败类别相关，不发生无因果重复循环。
- 预算、连续失败和 context exhausted 都能结束为可解释的 blocked/unverified。
- targeted test、typecheck、lint、build 的选择和跳过理由可回放。
- native 与外部 backend 在相同任务集上分别报告代码正确性、恢复、安全和成本，不用最终自然语言作为唯一质量指标。

## 补充：Repo intelligence minimum

repo/package/import/export map、symbol/reference 查询、structured diagnostics、失败日志定位、token-aware ranking、context invalidation 和按需 git history/blame 必须在 parity MVP 前可用。每次检索返回 path、line range、workspaceRevision、provenance、ranking reason 和 truncation；外部编辑或 patch commit 后失效相关索引，不能继续使用旧 context。

## 补充：Failure classification 与 repair budget

验证失败统一归类为：代码、测试、环境、权限、依赖、并发冲突、未知。classifier 必须保存原始命令、cwd、argv、exit/signal、stdout/stderr artifact、diagnostics、base/verified workspaceRevision 和归因置信度。repair loop 只允许针对性重试：同一 command+workspaceRevision 连续失败触发 breaker；达到 `maxRepairAttempts` 或 token/time budget 后进入 `blocked`/`unverified`。环境/权限失败不能被当作代码通过，targeted test 也必须记录发现来源、覆盖理由和未覆盖范围。

## 补充：ModelRouter 合同

```ts
interface ModelRouteRequest {
  taskClass: "explore" | "plan" | "edit" | "debug" | "review";
  requiredTools: string[];
  contextTokens: number;
  budget: { tokens?: number; cost?: number; latencyMs?: number };
  providerHealth: Record<string, "ready" | "degraded" | "down">;
  current: {
    model?: string;
    promptHash: string;
    toolSchemaHash: string;
    logRevision: number;
    workspaceRevision: string;
    gitRevision?: string;
  };
}
interface ModelRouteDecision {
  provider: string;
  model: string;
  reasoningEffort?: string;
  score: number;
  fallbackChain: string[];
  reason: string;
}
```

Router 按 task class、tool-use/patch 能力、上下文窗口、版本、延迟、成本、health、provider quirks 和历史失败率评分；route/hand-off 必须产生 durable `model_rerouted` event。provider circuit breaker、task-level override、cost budget 和无法切换时的 history/pending interaction 保存语义必须显式实现。fallback 只有在 prompt snapshot、tool schema、workspaceRevision 和 pending interaction 兼容时才可复用原 turn。

## 补充：垂直切片 prompt

bugfix、多文件 API、失败修复三个切片都要同时包含 context、工具、模型路由、verification、UX 和 benchmark fixture；单纯扩大 prompt 或工具目录不能视为编码能力提升。
