# 工具定义开销基线

所属专项：[Agent 工具优化](../SPEC.md)。

测量日期：2026-10-11。下方逐项表保留实现前源码 `dd1bb16` 的盘点；实现后的补测另列于本节。用途是为 [ToolSearch 规范](SPEC.md) 的可调预算提供依据，不代表实际 provider 计费。

## 实现后补测

通过当前 `builtInTools`、`ToolRegistry.toContracts()` 与生产使用的 `estimateAiSdkToolSchemaTokens()` 统计全部 provider-visible 内置定义，包含 ToolSearch 与 ApplyPatch。未连接 MCP，未套用特定会话的端口/角色裁剪；这不是某个真实会话同时获准 39 个工具的承诺。

| SDK 转换路径                                        | 全内置目录（39 个） | 常驻（15 个） | 初始定义估算降幅 |
| --------------------------------------------------- | ------------------: | ------------: | ---------------: |
| openai-compatible                                   |              23,922 |         8,288 |            65.4% |
| Anthropic（`claude-sonnet-4-5` strict schema 路径） |              24,732 |         8,602 |            65.2% |

因此 16,000 的默认总预算在该基准中为按需工具预留约 7,400–7,700 个估算 token。MCP 大小、角色描述和 provider 转换会影响实际会话结果；常驻超限时仍保留常驻并拒绝新激活。统计忽略内部 outputSchema/权限元数据，计算转换后的 name、description、inputSchema、strict/providerOptions 等发送字段；未执行网络请求或比较真实 usage。

## 方法与边界

- 临时审计脚本通过 `tsx` 将 workspace 包入口映射到对应 `src`，依次调用 `registerBuiltInTools`、`ToolRegistry.toContracts()`、`projectToolModelContract`、`toAiSdkTools`，读取定义，不执行 handler、不创建 AgentRuntime、不连接 MCP。未使用已有 `dist` 作为统计来源。
- 基准使用 `embeddedSearchEnabled=true`、默认 Bash timeout policy、`openai-compatible` 转换；Read 未启用 PDF，Agent 未传自定义 profiles，`js` 未启用 browser 文档。
- 为盘点定义而开启各工具注册选项；这不代表某个真实会话同时具备所有工具。实际请求仍取决于端口、角色、模型、功能开关、allowlist 和 disallowlist。
- 两列均使用当前 [`estimateTokens`](../../../apps/zcode-cli/packages/core/src/context/utils.ts) 的启发式：`ceil((字符串长度 + U+4E00–U+9FFF 字符数) / 3)`；除数来自 [`usage-stats.ts`](../../../packages/shared/src/usage-stats.ts)。逐工具计算后求和，字符长度采用 JavaScript `string.length`。
- **模型字段估算**：对 SDK 转换后的 `{ name, description, inputSchema }` 紧凑 JSON 估算。它更接近预算目标，但不包含 provider 外层包装、字段重命名和 tokenizer 差异，不能称为实际计费 token。
- **当前内部估算**：复现 [`context-usage.ts`](../../../apps/zcode-cli/packages/core/src/runtime/methods/context-usage.ts) 的 `buildToolUsageDetail()`，额外包含 `capability`、`outputSchema`、`readOnly`、`destructive`、`sideEffectScope`、`permission`、`resultBudget`。此口径不能直接作为模型收到的定义开销。
- [`tool-transform.ts`](../../../apps/zcode-cli/packages/adapters/src/model/tool-transform.ts) 的 strict/MFJS/provider 适配可能继续改变 schema；本次普通工具的输入 schema 在所选转换路径上未改变。

## 14 个现有常驻工具

| 工具               | 模型字段估算 token | 当前内部估算 token |
| ------------------ | -----------------: | -----------------: |
| Read               |                473 |              2,004 |
| Write              |                213 |              1,482 |
| Edit               |                321 |              1,631 |
| Bash               |                828 |              2,212 |
| WebFetch           |                248 |                754 |
| WebSearch          |                279 |                833 |
| TodoRead           |                 68 |                447 |
| TodoWrite          |                372 |              1,026 |
| EnterPlanMode      |              1,437 |              1,815 |
| ExitPlanMode       |                920 |              1,460 |
| AskUserQuestion    |              1,632 |              2,699 |
| TaskOutput         |                515 |                946 |
| TaskStop           |                179 |                460 |
| ReadSessionContext |                463 |              1,019 |
| **合计**           |          **7,948** |         **18,788** |

模型字段 JSON 总长度为 23,837；内部口径 JSON 总长度为 56,355。分别只估算输入 schema 和描述时，合计为 3,278 与 4,346 token；字段包装和取整口径不同，这两项不能直接相加当作完整定义大小。

实现前盘点尚未计入 `ToolSearch`。因此 **7,948 不是当前 15 个常驻工具的完整开销**；当前补测见文首。

## 其他基础工具

以下为同一基准下的单项模型字段估算，尚未应用真实会话的资格过滤。

| 工具                    | 估算 token | 可用条件或变化来源                                |
| ----------------------- | ---------: | ------------------------------------------------- |
| Agent                   |        942 | subagent port；profiles 改变描述                  |
| Skill                   |        571 | skill port                                        |
| SendMessage             |        368 | subagent port 支持 sendMessage                    |
| CronCreate              |      2,058 | automation port，非 subagent_child                |
| CronList                |         74 | 同上                                              |
| CronUpdate              |      1,289 | 同上                                              |
| CronDelete              |        122 | 同上                                              |
| CreateWorkflow          |      1,252 | 动态 workflow 开关及角色限制                      |
| AmendWorkflow           |        868 | 同上                                              |
| SaveWorkflow            |        893 | 同上                                              |
| EvalWorkflowSnippet     |        422 | 动态 workflow 开关                                |
| ListWorkflowRuns        |        954 | 同上                                              |
| GetWorkflowRun          |        931 | 同上                                              |
| ResumeWorkflowRun       |        661 | 动态 workflow 开关及角色限制                      |
| ResolveWorkflowQuestion |        501 | 同上                                              |
| ListSavedWorkflows      |        326 | 动态 workflow 开关                                |
| ListModels              |        313 | 同上                                              |
| js                      |        462 | nodeRepl 功能开关                                 |
| RespondToCoordinator    |        351 | subagent_child 与 coordinator port                |
| submit_result           |        135 | workflow submit port；此处未配置自定义结果 schema |
| escalate                |        546 | workflow escalate port                            |

Cron 四个工具合计 3,543；动态 workflow 十个工具合计 7,121。工具条件可能互斥，不能把全表合计当成主会话请求的开销。`Task` 是 `providerVisible: false` 的兼容入口，不计入模型工具定义。

## 需要重算的变化

| 变化                                              | 本次观察                                                                                         |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `embeddedSearchEnabled=false`                     | Bash 833、EnterPlanMode 1,433、Agent 946；14 个常驻合计 7,949；此分支另有 Glob 244、Grep 1,075。 |
| Read 支持 PDF                                     | Read 从 473 增至 564，常驻合计增加 91。                                                          |
| 模型不支持 native WebSearch                       | 当前 runtime 隐藏 WebSearch，常驻合计减少 279。                                                  |
| `js` 启用 browser 文档                            | 从 462 增至 1,628。                                                                              |
| Agent profiles、typed submit_result、Bash timeout | 动态描述或 schema 改变，需要按实际配置重算。                                                     |
| ToolSearch、LSP、AST、DependencyGraph、ApplyPatch | 尚无完整可调用实现，本基线未计入；ApplyPatch 现有 contract 不等同于最终工具定义。                |
| MCP                                               | descriptor 来自实际连接，本次未读取用户连接或凭据，无法据静态仓库给出总量。                      |

预算结论：既定常驻名单本身已有约 7.9k 估算 token，节省主要来自暂不携带其余工具定义。没有按需工具可省的会话，新增 `ToolSearch` 反而会增加定义开销；不能承诺所有会话都节省 token。可调初值还应结合 ToolSearch/LSP 的最终定义、实际 MCP 目录及模型上下文容量确定，并保留常驻与按需两部分统计。
