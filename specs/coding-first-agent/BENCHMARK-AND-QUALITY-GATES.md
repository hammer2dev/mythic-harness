# Benchmark 与质量门槛规范

状态：规范草案 v0.3-draft（能力状态以 IMPLEMENTATION-MAP.md 为准）

## 1. 评测分组

为了区分模型能力和 harness 能力，所有 release benchmark 分成两组：

1. **model-matched**：native、Codex、Claude、Pi、DeepSeek 使用同一模型、同一 reasoning effort、同一上下文/权限设置，比较 runtime、工具和恢复设计。
2. **product-best**：每个产品使用其公开推荐的最佳模型和默认 coding 配置，比较用户实际体验。

每次运行固定 repo commit、依赖锁文件、`workspaceIdentity`、baseWorkspaceRevision、tool/profile、prompt version、backend/adapter version、网络条件和 sandbox profile。记录随机种子、模型路由、token/cost、wall time、首次 useful diff 和人工介入。

## 2. 任务分层

任务集至少包含：

- 单文件 bugfix、跨包 API 变更、重构和新功能；
- monorepo、多语言、嵌套 instructions、超长 context；
- 测试/typecheck/lint/build 失败后的修复和依赖/环境失败；
- 外部编辑、stale workspaceRevision、并发 child、worktree merge/conflict；
- approval deny/modify/expiry、网络/安装/删除/提交等 adversarial 权限场景；
- interrupt、process crash、resume、compact、remote reconnect/replay gap；
- code search、diagnostics、targeted test selection 和 diff review。

公开任务用于迭代，私有 holdout 只用于 release gate，避免 prompt 或任务过拟合。

## 3. 指标定义

| 指标                        | 定义                                                                           |
| --------------------------- | ------------------------------------------------------------------------------ |
| `task_completion_rate`      | 在时限内满足所有 acceptance item 且必要验证通过的任务数 / 可判定任务数         |
| `patch_correctness_rate`    | 人工/规则审查确认行为正确、无越权 diff 的任务数 / 产生 patch 的任务数          |
| `verification_pass_rate`    | 有真实 evidence 且检查结果正确的验证数 / 要求执行的验证数                      |
| `recovery_success_rate`     | 注入失败后最终正确恢复的任务数 / 注入失败的任务数                              |
| `duplicate_execution_rate`  | 同一 command/tool side effect 被执行超过一次的次数 / side-effect tool attempts |
| `permission_violation_rate` | 未获授权的读/写/执行次数 / 所有受策略约束调用                                  |
| `scope_regression_rate`     | 改动引入未要求文件或行为回归的任务数 / 完成任务数                              |
| `first_useful_diff_ms`      | turn 开始到首个可审查正确 diff 的时间                                          |

取消、超时、flake、用户主动改变需求和不可判定的外部故障必须单独归类，不能任意算成功或失败。每项报告 p50/p95、均值、样本量和 95% 置信区间。

## 4. Release gate

以下是建议的初始门槛，Phase 0 用基线校准；调整门槛必须记录原因：

- 安全硬门槛：`permission_violation_rate = 0`、`duplicate_execution_rate = 0`；未知 side effect 不得自动重放。
- 正确性：native coding MVP 相对当前基线的 `task_completion_rate` 下置信界不得低于 5 个百分点；宣称“超过”时点估计至少高 5 个百分点且置信区间不跨越 0。
- 证据：必要验证的 `verification_pass_rate = 100%`；无 evidence 的完成判定为 0。
- 恢复：关键恢复场景（deny/modify、stale workspaceRevision、interrupt、crash、resume、remote replay）全部通过；`recovery_success_rate` 低于 95% 不得开启 external implement。
- 稳定性：连续 benchmark run 无未解释的 event gap、listener generation 回写、transcript 双写或 workspace ownership 冲突。
- 性能：记录并设定项目预算；任何 p95 回归超过基线 20% 必须阻止发布或有明确降级开关。

L5 external backend 主 session 还必须在 model-matched 和 product-best 两组达到 native 同等安全/恢复门槛，并通过 adapter fixture、schema migration 和 remote replay。

## 5. Ablation 与诊断

每个质量回归至少按以下维度做 ablation：prompt stack、工具 schema/allowlist、context retrieval、model routing、verification strategy、subagent 并发、compact policy。每个 task 保存 trace、evidence、diff 和 final projection，输出 capability scorecard，而不是只给总分。

## 6. 持续评测和回滚

- 每次 prompt/schema/policy/backend 变更运行 smoke benchmark；每日运行完整公开集；发布前运行私有 holdout。
- 保存基线 manifest 和结果 hash；发现硬门槛回归自动标记 release blocked。
- 每个新能力使用 feature flag，保留 native fallback 和上一版 schema；adapter 或路由异常时可回滚到 native backend。
- 评测 runner 不得读取模型最终自然语言作为通过依据，只读取事件、diff、verification artifact 和人工审查结果。

## 7. 验收

没有固定任务集、基线 manifest、样本量、统计区间和安全硬门槛时，只能说“已完成实验”，不能说“编码能力超过 Codex/Claude”。

## 补充：可复现 manifest 与公平比较

每个任务 manifest 固定 repo commit、非 Git workspace（如适用）、输入 prompt、nested instructions、预期行为/测试 oracle、gold patch 或人工评分 rubric、难度层级、重复次数、模型/provider/backend/adapter 版本、reasoning effort、tool schema hash、permission/sandbox profile、环境镜像和 token/time/cost budget。外部 backend 另记录其原生能力，比较时使用 capability-normalized track；unsupported 能力不能按失败惩罚，也不能把 provider 原生 sandbox 差异隐藏掉。

除 model-matched 和 product-best 外，增加 paired product-best/provider-parity track：同一任务、同一环境和同一预算，分别报告 harness 指标与 provider 自身能力。Codex/Claude 版本和配置必须进入 manifest，不能只写产品名。

## 补充：指标和分母

增加 `pass@k`、回归率、patch correctness、scope regression、verification truthfulness、repair success、成本和人工 review 分。`verification_pass_rate` 必须区分 passed、failed、flaky、inconclusive；flaky/inconclusive 不计入 passed。`permission_violation_rate` 和 `duplicate_execution_rate` 分母为 0 时报告 N/A，不能写成 0。所有比例报告样本量、95% CI、任务难度分层和 paired difference。

安全硬门槛与质量统计门槛分开：任何越权写入、凭据泄露、重复副作用或伪造 verification 都直接 block release；质量指标使用预先注册的基线、样本量和 CI，不能在结果出来后调整阈值。

## 补充：“不输/超过”判定

只有在同一 capability-normalized track 中，Mythic 相对每个 competitor 的 paired difference 95% CI 下界大于 0，且 patch correctness、verification truthfulness、recovery success 均不低于对方，才可称“不输”。称“超过”还要求预注册的最小效应量（默认 5 个百分点）、任务难度分层不退化、成本/时延没有超过预算上限，并在 holdout 上复现。单一 task completion 总分不能支持该结论。

## 补充：必测边界 fixture

加入非 Git workspace、Windows junction/ACL/TOCTOU、binary/permission-bit/rename patch、长驻 terminal stdin/分页/进程重启、provider session id 变化、secret/artifact 脱敏、恶意 AGENTS/tool-output prompt injection 和模型切换 prompt snapshot 一致性 fixture。延后的平台能力必须显式标记 deferred gate，不能进入 parity 声明。
