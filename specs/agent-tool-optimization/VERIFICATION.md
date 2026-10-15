# ToolSearch / ApplyPatch 实现验证

## SendMessage 替换 TaskOutput 常驻位置（2026-10-12）

用户确认后，唯一源码改动是 Runtime `RESIDENT_TOOL_NAMES` 中以 SendMessage 替换 TaskOutput。通用候选仍为 18 个，角色控制候选仍为 3 个；注册、权限、handler、32,000 总预算和每次最多 5 项规则均沿用原实现。

- 3 个内联核心回归用例在修改前均失败，修改后 3/3 通过。使用真实 AgentRuntime、工具注册和请求投影入口，验证首请求含 SendMessage、不含 TaskOutput，准确搜索 TaskOutput 后下一步骤提供完整 schema；旧 SendMessage 激活标记清理、低预算常驻保护、TaskOutput 激活快照恢复；缺少消息端口、受限子代理白名单及显式禁用不能扩权。不调用外部模型或实际发送消息，未生成或保留 `.test.ts` 文件。
- 当前 CLI 构建 11/11 通过。独立临时工作目录和会话存储中的真实 CLI 会话使用当前模型配置，最终 OpenAI Responses 请求包含 17 个常驻工具及完整参数 schema：含 SendMessage 的 to/summary/message，不含 TaskOutput；模型正常结束，未调用工具。18 个通用候选中的 WebSearch 因当前模型不支持原生搜索而未加载。此项只验证实际请求加载，不代表发送消息、TaskOutput 执行或 Desktop/手机 UI 端到端验收。
- 首次准确搜索后的激活链路由上述 Runtime 用例验证。此前真实模型在 ToolSearch 中填入错误 `server: "functions"` 导致零命中的问题，本次没有修复，也未将其标为通过。
- 根目录 typecheck 通过；CLI typecheck 27/27 通过。根目录 lint 为 17 个既有 warning、0 error；CLI lint 因未改动文件的 max-lines 错误未通过；改动的 tool-exposure.ts 单独 lint 为 0 warning、0 error。CLI 命令初次因找不到 turbo 失败，补充现有根目录 node_modules/.bin 到本次进程 PATH 后重试，未修改仓库配置。验证环境 Node 24.19.0，仓库 mise.toml 指定 24.14.0，CLI 输出了 engine 警告。
- 架构检查改动前后均为 0 violations / 0 baseline / 0 new。状态仍由 Runtime ToolExposureState 单一拥有，未增加接口、模块依赖或恢复路径。唯一源码净行数为 0；工具定义基线已重测，见 [SCHEMA-BASELINE.md](tool-search/SCHEMA-BASELINE.md)。

本轮未暂存、提交或推送。以下保留先前版本的历史验证记录。

日期：2026-10-11。范围仅为两个基础工具；LSP、AST、Dependency Graph 和软件开发插件仍为待定设计。

## 自动化结果

35 项测试通过，0 失败、0 跳过。测试使用真实 AgentRuntime、NodeFileSystemAdapter 临时目录及 SQLite 会话存储；模型使用可控脚本响应，MCP 使用测试 descriptor/handler，不调用外部服务。

| 行为       | 已验证证据                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 搜索与请求 | 首请求仅常驻；ToolSearch 后下一请求带 ApplyPatch 完整 schema，并实际创建文件；结果不重复携带 schema。                                                        |
| 权限与预算 | 内置/MCP 搜索、受限子代理不扩权、取消不激活、移除不复活；估算总预算、常驻超限、跨轮 LRU、同批已调用工具保护。                                                |
| 会话历史   | compact 不带工具；SQLite 冷恢复、真实 fork 边界及 conversation rewind 正确恢复激活状态。                                                                     |
| 配置       | 默认 16,000/5，用户与项目按字段合并、非法值拒绝、runtime 覆盖优先；结果上限可调。                                                                            |
| 补丁提交   | 四种操作、多 hunk、全量预检阻断、严格唯一匹配、移动部分完成、后续条目停止、排他创建竞争、revision hash 冲突。                                                |
| 取消与失败 | 提交后取消仍返回已落盘项；后置 hook 异常不擦除事实；未知 I/O 明确未确认；被修改输入重新检查目标权限。                                                        |
| 文件边界   | NUL 拒绝、符号链接预检与提交复检；沿用现有文本编码/主换行策略。                                                                                              |
| 恢复与展示 | 部分提交 checkpoint、artifact 失败仍有 turn changes；删除的 null 后态、并发重建冲突；GBK + CRLF rewind 与失败补偿；冷恢复 read-state 不重复写盘。            |
| 双链路投影 | partial/error 多文件 diff 经真实 V4 ProductProjection、冷 transcript hydration、continuous/replayable snapshot 均保留；先改后删的 live/cold/query 摘要一致。 |

以上为删除测试源码前的历史验证结果。15 个临时测试文件已按用户 2026-10-11 的要求删除，原测试命令不再是当前可执行入口；后续需要复验时编写临时核心用例，执行完成后删除，不随代码提交。

## 测试源码清理复核（2026-10-11）

已删除全仓 39 个 `.test.ts` 文件（含上述 15 个文件），源码目录复扫无剩余；`.gitignore` 对根包与 CLI 内的同后缀路径均生效。根与 CLI `typecheck` 通过，CLI 为 27/27 tasks；根 `lint` 通过，仍有 17 条既有警告。CLI `lint` 仍被既有 `max-lines` 错误阻塞，本次未修改生产源码。架构检查通过，0 baseline、0 new violations；`git diff --check` 通过。本次只清理验证源码和引用，未重新执行已删除的行为测试。

## 静态检查

以下命令在本次审查修复后重新执行，结果与先前基线一致；具体修复验证见下节。

| 命令                                  | 结果                                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                      | 通过。                                                                                                                                  |
| `pnpm lint`                           | 通过，17 条已有警告、0 错误。                                                                                                           |
| `pnpm --dir apps/zcode-cli typecheck` | 通过，Turbo 27/27 tasks 成功。                                                                                                          |
| `pnpm --dir apps/zcode-cli lint`      | 未通过；现有文件超 400 有效行的规则阻断。core/adapters/bootstrap/contracts 的错误文件在 HEAD 基线也已超过限制；没有修改基线或关闭规则。 |
| `pnpm architecture:check --changed`   | 通过，0 baseline、0 new violations。                                                                                                    |

CLI 子目录缺少本地 Turbo shim，本次运行聚合检查前，仅在命令进程内把仓库根 `node_modules/.bin` 加入 PATH；没有修改依赖或全局环境。使用 Node 24.19.0，仓库固定 24.14.0，命令报告版本警告；Turbo 也报告部分工作区未出现在 lockfile 的警告。上述类型检查仍真实成功。

## 审查修复与代码质量复查（2026-10-11）

先更新 ToolSearch 与 ApplyPatch spec，再修复三个已确认问题：受限 workflow child 缺少发现入口、移动文件丢失原权限、多文件差异截断后 UI 丢失提示和真实总数。

| 修复               | 本轮验证证据                                                                                                                                                                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 受限工作流发现入口 | 真实 AgentRuntime 的 3 个核心用例从修复前 2 失败、1 通过变为 3/3 通过。验证白名单内 ApplyPatch 可被发现并进入后续请求、白名单外 Skill 不可发现、显式禁用仍生效，以及普通子代理控制工具回归。workflow child 只自动补入 ToolSearch。                                                                                            |
| 文件权限保存与恢复 | 3 个核心用例从全部失败变为全部通过，覆盖 move/delete 前镜像经 checkpoint 和 workspace fork 传递 mode、rewind 失败补偿及旧 artifact 兼容、真实 Node adapter 条件创建与普通原子恢复。0755/0600 用端口断言验证完整传递，Windows 文件验证平台支持的只读属性；未执行 POSIX 实机测试。                                              |
| 截断投影与展示     | 临时核心断言通过：33 个提交路径保留 totalFiles=33、仅展示 32；CLI 与 V4 schema 均保留新字段并兼容旧载荷；少量文件仅内容截断也保留提示。真实 EditToolCallBlock 的 headless Chrome 交互通过：1280px 展开显示真实总数和 32 个子卡，390px 提示完整处于视口内，旧载荷只称已展示数量，英文内容截断提示正确；浏览器 pageerror 为 0。 |

代码质量复查覆盖工具加载状态、预算提交、权限边界、补丁预检/逐项提交/记账、文件属性快照与 UI 派生展示，未发现新的可确认缺陷。沿用 Runtime 的唯一加载状态和执行端 FileSystemPort，不新增 UI store/effect；清理一处未使用的局部变量并更正失实注释。CLI 的既有超长模块仍是质量债务，本轮没有关闭规则或扩大为跨模块重构。

根与 CLI 类型检查通过（CLI 27/27 tasks），根 lint 为 17 条既有 warning、0 error；CLI lint 未通过，已输出错误均为既有 max-lines。架构检查 0 violations，改动文件格式检查与 git diff --check 通过。临时测试、浏览器 fixture 和验证脚本已全部删除，源码范围复扫无 `.test.ts`；自建浏览器与开发服务器已关闭。

本轮浏览器证据是实际组件交互，不等同于完整 Agent 会话或 Desktop/手机远程断线重连验收。所有修复保持未暂存、未提交、未推送，原有暂存删除和其他本地改动保留。

## 估算与验收边界

ApplyPatch 改为常驻前，39 个 provider-visible 内置工具的 SDK 定义约 23,922 个估算 token；当时 15 个常驻约 8,288，初始定义估算减少 65.4%。Anthropic strict 转换路径分别为 24,732/8,602。这是历史盘点；最新常驻名单的重新测量见 [开销基线](tool-search/SCHEMA-BASELINE.md)。各次盘点均未做具体会话资格裁剪，不含 MCP，非 provider tokenizer 或计费数据。

真实 OpenAI Responses 请求的常驻工具加载验证见本页末节；其余历史测试使用可控模型。尚未执行真实 Anthropic 请求、外部 MCP 服务、Desktop 与手机实机断线重连，以及 macOS/Linux 文件系统测试。双链路证据是运行时/协议集成测试，不能替代这些实机验收。

文件 revision 检查与 OS 提交不是跨进程事务锁；多文件提交按已确认规则允许部分成功。混合换行沿用现有端口的主换行策略，不承诺逐字节保留混合换行或 BOM。

## ApplyPatch 常驻调整（2026-10-11）

按用户确认，ApplyPatch 从按需工具改为常驻候选，名单由 15 项增为 16 项；沿用 Runtime 的单一常驻集合，工具总预算仍为 16,000，不新增配置或持久化状态。同时删除 ToolSearch 描述中将 ApplyPatch 列为按需示例的文字，并同步总览及专项 spec。

1 个临时真实 AgentRuntime 核心用例在修改前失败、修改后通过：首次 `getExposedTools` 即含完整 ApplyPatch schema 和补丁格式说明；预算为 1 时仍保留获准常驻工具；压缩后的工具暴露快照在新 Runtime 恢复后仍包含 ApplyPatch；白名单外与显式禁用时不暴露。此处验证运行时投影和快照恢复入口，未执行真实 provider API 或实际存储 cold-resume。测试与临时配置文件已删除。

重新执行根与 CLI typecheck 均通过（CLI 27/27 tasks）；根 lint 通过，17 条既有 warning、0 error。CLI lint 仍因既有 max-lines 未通过。架构检查 0 violations，改动文件格式检查通过。代码调整仅增加一个常驻名称并修正文案，不改变工具执行和审批语义；本轮未暂存、提交或推送。

## ToolSearch 主动发现引导（2026-10-11）

仅加强 ToolSearch 的模型描述和默认会话的条件 session guidance：工具列表不是完整能力目录，需要缺失的专用能力时先搜索，再选择通用工具替代或报告不可用；已有合适工具直接使用，加载成功后按下一步骤提供的 schema 调用。当前请求必须提供 ToolSearch 才适用引导，原工具名单、搜索分支、检索算法、预算和执行权限均未改变。

1 个临时核心用例通过：真实 ContextBuilder 的 systemMessages 在具备 ToolSearch 时包含主动发现提示，缺少工具、自定义 prompt 和 workflow actor 时保持既有注入边界；普通 SubagentContextBuilder 保持原 session guidance 行为，真实受限 AgentRuntime 的 ToolSearch 模型 contract 携带加强后的说明。测试及映射配置已删除。本轮验证提示构建和模型可见 contract，未调用真实模型 API，不将提示验证等同于模型必然主动搜索。

根与 CLI typecheck 通过（CLI 27/27 tasks），根 lint 通过（17 条既有 warning、0 error）；两个改动源文件定向 lint 通过，CLI 全量 lint 仍因既有 max-lines 未通过。架构检查 0 violations，格式与 git diff --check 通过。freshness 命令执行时 GitHub 连接失败，未完成远端基线刷新；未更改分支或 Git 提交。工具定义开销已同步重新测量；session guidance 属于系统提示开销，不计入工具 schema 预算。

## 常驻工具真实请求端到端验证（2026-10-11）

使用当前工作区构建的 CLI bundle，经过真实 CLI 单次 prompt、会话 Runtime、模型适配器和外部模型 API，核对本次新会话的 model-io 最终请求体。验证未注入脚本模型或 mock response，未覆盖模型选择、工具名单、工具预算或权限模式；工作目录、会话数据库和日志存储均使用独立临时目录。

- 请求时间：2026-10-11 23:00:48（Asia/Shanghai）。
- 当前环境没有显式默认模型选择，沿用现有 registry fallback：gpt-6.1-sol，OpenAI Responses 协议，supportsNativeWebSearch=false。
- 主会话请求 1 次，attempt=1；最终 body.tools 包含 15 项，每项均有对象参数 schema，与逻辑 request.toolNames 一致，没有额外按需工具。请求体未标记为 ai_sdk_options 失败回退。
- 实际名单：Read、Write、Edit、ApplyPatch、Bash、WebFetch、TodoRead、TodoWrite、EnterPlanMode、ExitPlanMode、AskUserQuestion、TaskOutput、TaskStop、ReadSessionContext、ToolSearch。
- 模型返回预期短文本 TOOLS_LOADED_OK，finishReason=stop，无请求错误，CLI 退出码 0。提示明确要求不执行工具，实际工具调用数为 0。

结论：当前模型实际加载 15 个常驻工具；ApplyPatch 与 ToolSearch 均进入真实请求。16 项是常驻候选名单，WebSearch 因当前模型不支持原生网页搜索被资格过滤，不能声称本次发送了全部 16 项。当前启用原生网页搜索的规则限定 Anthropic 协议；本次没有更换模型或强制能力开关。

本轮验证证明基础工具定义真实进入模型请求且模型成功响应；不证明每个工具都执行成功，也不证明模型必然主动调用 ToolSearch。未覆盖 Desktop UI、远程链路、受限子代理或 Anthropic 原生搜索。

构建 11/11 tasks 成功；重新执行 pnpm typecheck 通过，pnpm lint 为 17 条既有 warning、0 error。开工 freshness 的远端 fetch 因 GitHub 连接重置未完成。本轮未修改生产源码，未生成保留的测试源码；脱敏摘要仅保存工具名称、schema 大小/哈希和请求结果。原始临时会话目录的删除被自动审批审查拒绝（仅返回 blocked by policy，未给出具体原因），目录暂时保留；未将原始请求日志写入 spec。未暂存、提交或推送。

## 能力入口与角色控制工具常驻、预算调整（2026-10-11）

按用户确认，将 Agent、Skill 加入通用常驻候选，通用候选增为 18 个；RespondToCoordinator、submit_result、escalate 在原有角色、端口和权限资格下常驻。SendMessage 继续按需。默认工具定义总预算从 16,000 提高到 32,000，每次最多 5 项；已有用户、项目或 Runtime 显式配置保持优先，不改写配置文件。

本轮生产变更仅涉及 zcode-cli 模块内的 core/runtime/tool-exposure.ts 和 contracts/tools/tool-search.ts，净增 7 行。Runtime 仍是工具加载状态的唯一所有者，沿用现有资格过滤、预算计算、快照和请求投影，不增加协议字段或第二套角色状态。spec 和验收规则已先于源码更新。

### 核心验证

- 真实 AgentRuntime 的 3 个临时核心用例全部通过：主会话首次 Model 请求直接包含 Agent/Skill，真实 ToolSearch executor 激活后下一请求才出现 SendMessage；受限子代理继续遵守白名单与显式禁用；工作流子代理在预算为 1 时仍直接提供获准 submit_result/escalate 和完整 typed result schema，额外按需工具返回 budget_exceeded。模型端口使用内存桩，不计作网络验证；临时测试与源码映射 loader 已删除。
- 1 个旧快照恢复用例通过。修改前通过进程内模拟 Skill 升为常驻，复现预算 10 却保留总成本 14 的工具集合：LRU 错把旧常驻激活记录算作可回收空间。修改后 prepare 在预算计算前移除已转常驻的旧激活标记，按需 SendMessage 被正确淘汰，真实成本为 7；compact 快照恢复后仍保持正确集合。未修改持久化格式。
- 1 个配置核心用例通过：contracts 默认与真实 ConfigPort 均为 32,000/5；用户显式 16,000 与项目仅覆盖 maxResults=3 可以同时保留。

### 真实模型请求

使用当前工作区重新构建的 CLI bundle，以独立临时工作目录、数据库和存储发起新会话，沿用当前模型配置。2026-10-11 23:41:34（Asia/Shanghai）的 OpenAI Responses 主请求 attempt=1，最终请求体包含 17 个工具及参数 schema：

Read、Write、Edit、ApplyPatch、Bash、WebFetch、TodoRead、TodoWrite、EnterPlanMode、ExitPlanMode、AskUserQuestion、TaskOutput、TaskStop、ReadSessionContext、ToolSearch、Agent、Skill。

WebSearch 因当前模型 supportsNativeWebSearch=false 被过滤；SendMessage 与三个角色控制工具没有出现在主请求。请求体未使用 ai_sdk_options 失败回退。模型成功返回 RESIDENT_TOOLS_OK，finishReason=stop，CLI 退出码 0，无请求错误。提示要求不调用工具，实际调用数为 0；这证明定义加载，不代表各 handler 均已实际执行或模型必然主动委派。原始会话日志仅存于本机 Git 忽略的临时目录，spec 只记录脱敏结论。未覆盖 Desktop UI、手机远程链路或真实 Anthropic 网络请求。

### 检查结果

- CLI 及依赖构建 11/11 tasks 成功。根 pnpm typecheck 通过；CLI typecheck 27/27 tasks 成功。
- 根 pnpm lint 通过，17 条既有 warning、0 error。CLI 全量 lint 未通过，输出的错误均为既有 max-lines；两个本轮改动源文件使用真实 oxlint 定向执行，0 warning、0 error。
- architecture:check --changed 通过：0 baseline、0 new violations。zcode-cli 当前为 unmanaged 模块；未新增跨模块依赖。
- 开工 freshness 的远端 fetch 因 GitHub 连接重置未完成。Node 为 24.19.0，仓库固定 24.14.0；Turbo 提示本地 shim/lockfile 工作区信息问题，上述已完成检查的真实结果如上。
- 改动源文件与文档的格式检查、git diff --check 通过；排除依赖和构建产物后复扫无 `.test.ts`。本轮不保留临时测试源码；未暂存、提交或推送，其他工作区改动与原有暂存删除保留。

## ToolSearch 服务筛选与真实发现链路修复（2026-10-12）

### 原因与修复边界

此前真实调用带有 source=builtin、server=functions 时，所有内置工具都被服务筛选排除，结果却只建议更换关键词，无法指导模型清除错误筛选。原合同没有显式空值，仅支持省略 server。源码调查确认，OpenAI SDK、模型参数归一化、Core admission 和执行校验均没有注入 functions 默认值；旧日志是归一化后的结果，不能据此断言此前错误由模型自主生成或服务端严格模式产生。

本轮先更新 spec，再修改 contracts、Core ToolExposureState 与 ToolSearch 描述。server 允许 null 表示不按服务筛选；内置来源与服务筛选冲突、当前 eligible 目录无此服务分别返回可纠正反馈；合法服务内零命中也提示显式清除筛选。保持精确过滤，不静默扩大目录，不特判名为 functions 的真实 MCP 服务。Runtime 继续唯一持有激活状态，失败的 search 分支不新增或淘汰工具，既有 prepare 生命周期规则保持不变。不修改通用 provider 适配、常驻名单、预算、权限或存储格式。

[OpenAI Function calling 官方文档](https://developers.openai.com/api/docs/guides/function-calling)说明，省略 strict 时 Responses 会尝试兼容严格模式，可空类型可表达可选语义。本次原始 response.completed 中 ToolSearch 的 resolved strict 实际为 false，因此不把严格模式写成已确认根因。出站 server schema 为 oneOf[string, null]，实际请求获服务接受。

### 核心验证与真实模型验收

- 3 个内存核心用例通过：省略/null 均能发现内置工具且预算限制有效；来源冲突和未知 eligible 服务分别返回反馈且快照不变；有效 MCP 服务精确隔离，包括实际名为 functions 的服务。临时用例从 stdin 执行，没有保留测试源码。
- 真实验收使用 CLI run 入口、当前构建的 bootstrap/Core、真实 gpt-6.1-sol / OpenAI Responses、Bash executor 和本地 stdio MCP。仅通过 factory 的既有注入点隔离配置，保留用户现有 Provider Registry；未注入模型或工具执行桩。关闭插件、跳过旧用户配置，只连接 acceptance 测试服务，使用独立 workspace、数据库和存储。测试最终使用显式 yolo 模式，仅执行指定后台打印和只读 MCP；不能据此声称验证了交互审批流程。产品权限配置未改变。
- 2026-10-12 10:19:49–10:20:27（Asia/Shanghai），完整链路共 6 次主请求，工具数量为 17 → 17 → 18 → 18 → 19 → 19。首次为原有 17 个获准常驻工具，包含 SendMessage，不含 TaskOutput 或 MCP；WebSearch 仍因模型能力被过滤。模型自行搜索 TaskOutput，下一请求的完整参数 schema 与源码合同逐项一致，再执行 TaskOutput，返回 retrieval_status=success、exit_code=0、TOOLSEARCH_BACKGROUND_OK。随后搜索 acceptance/read_status，下一请求携带完整 MCP schema，真实调用返回 TOOLSEARCH_MCP_OK。CLI 退出码 0，模型最终 stop。
- 2026-10-12 10:20:21–10:20:37，独立故障恢复场景故意要求首个查询使用 source=builtin、server=functions。新反馈返回空结果；紧接的请求仍为 17 个常驻工具。模型自行省略 server 重试后加载 TaskOutput，第三次请求含完整 schema（18 个工具）。共 3 次请求、2 次 ToolSearch，CLI 退出码 0。这是受控错误输入恢复验证，不声称自然请求必然产生该错误。
- 临时 fetch tap 在 SDK 解析前旁读真实响应副本，只保存 function_call 参数和 ToolSearch resolved schema 摘要。本次两条成功验收中，所有 ToolSearch 原始 arguments 与本地归一化 input 一致。自然任务里的内置查询省略 server，MCP 查询使用 acceptance；受控错误查询的 functions 也已存在于原始响应中。该证据排除了本次客户端注入，不能进一步区分服务端模型与上游实现，也不能追溯替代旧会话的原始证据。
- 初次 build 权限模式的试跑被 headless Bash 审批拒绝，没有产生后台任务；未计作 TaskOutput 执行通过。之后仅调整隔离验收权限模式重跑，以上成功结论来自完整执行场景。

脱敏断言结果位于本机 Git 忽略目录 .tmp/tool-search-reliability/execution-evidence.json 与 recovery-evidence.json；保留 schema 哈希、工具名称、搜索结果和请求数量，原始临时日志不进入 spec。验收 harness、fetch tap 与 MCP fixture 完成后删除。未覆盖 Desktop UI、手机远程链路、Anthropic 实际网络调用或真实第三方 MCP 服务；本次结果证明已执行的发现链路和错误恢复，不保证所有模型每次都选择 ToolSearch。

### 检查与代码质量

CLI 构建 11/11 tasks 成功，根 pnpm typecheck 与 CLI typecheck（27/27 tasks）通过。根 pnpm lint 为 17 条既有 warning、0 error；CLI 全量 lint 仍未通过，输出 83 个既有 max-lines 错误，均不在本轮修改文件中。三个改动源码文件定向 lint 为 0 warning、0 error。架构检查 0 baseline、0 new violations；zcode-cli 当前为 unmanaged，未新增跨模块依赖，生产源码净增 36 行。定向审查未发现本次修改的可操作缺陷。

freshness 检查通过，基线与远端分支同步。Node 实际为 24.19.0，mise 要求 24.14.0。改动文件格式检查与 git diff --check 通过。本轮未暂存、提交或推送。

## 自然语言检索与 MCP 目录同步（2026-10-12）

### 本轮改动

按用户确认只处理自然语言检索及 MCP 目录同步。搜索改为分词、查询去重、英文功能词过滤，并按精确命中、有效关键词覆盖数和字段权重排序；MCP 原工具名、原始描述与服务名分开参与评分，不重复计算桥接层生成的 capability。保留精确搜索可能附带其他结果的策略，不调整常驻名单、32,000 预算或每次最多 5 项。检索仍是本地词汇匹配，不提供跨语言语义翻译。

MCP adapter 唯一持有当前 descriptor，SDK 目录通知串行刷新并提交 revision；Runtime 读取当前目录同步注册表，启动 promise 仅作就绪屏障。目录更新传递到 pool lease、子代理借用端口与插件提示，既有权限范围不扩大。目标 descriptor 已变化的旧 handler 会在进入 callTool 前返回可恢复错误。连接、断开及配置移除等待关闭之后也检查连接代次，防止旧操作覆盖新目录；同规范名更换 MCP 身份先撤下旧 entry，避免注册隔离逻辑使旧定义滞留。

### 实际验证

| 验证层              | 结果与边界                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 自然检索与 Runtime  | 4 项检索断言和 4 项真实 AgentRuntime 核心用例通过。`I want to schedule a recurring task` 中 CronCreate 从旧算法第 13 位进入第 2 位；短关键词与重复关键词排序一致，`TaskOutput?` 可召回。验证晚到目录、完整 schema 更新、删除、未变 entry 复用、目标旧 handler 拒绝及无关更新可执行、同名换身份、内置名称冲突、固定白名单和旧 port fallback。MCP 调用端口使用内存桩，未模拟真实 OAuth 浏览器授权。                                                                                                                               |
| MCP adapter 与 pool | 真实本地 stdio 服务 11 项通过，产生 17 次 tools/list。legacy 与现代协议均收到目录变化通知，schema 更新和删除生效；密集通知最大并发刷新为 1；刷新失败、同配置重连失败保留定义，显式断开和进程退出后自动重连成功；配置移除/禁用及 lease 释放撤下目录，同 key 重建生效。另 3 项受控关闭时序用例修复前均复现旧操作覆盖，修复后均保留新连接及目录。                                                                                                                                                                                  |
| 子代理与插件提示    | 3 项内存核心验证通过：已授予服务范围内跟随更新/删除，具体工具白名单不扩张，不修改父连接生命周期；旧端口兼容；启动目录为空时插件提示读取当前 eligible，并遵守本轮禁用。未运行完整子代理网络 E2E。                                                                                                                                                                                                                                                                                                                                |
| 真实模型发现        | 2026-10-12 14:39:41–14:40:00（Asia/Shanghai），gpt-6.1-sol / low 经真实 CLI run、bootstrap 和 OpenAI Responses 完成 2 次请求。隔离测试白名单仅含 ToolSearch、TaskOutput，首请求只暴露 ToolSearch。模型按测试要求查询完整短句 `I need to retrieve the output from a background task`，source=builtin，未传 server；搜索加载 TaskOutput，第二请求的完整 schema 与源码合同规范化哈希一致。只执行一次 ToolSearch，无后台任务、Cron 或已发现工具执行。该用例验证自然短句发现和定义装载，不代表全目录排名或无提示时模型必然主动搜索。 |

另一个 MCP 贯通场景通过：真实 stdio 服务 → adapter → pool lease → AgentRuntime → ToolSearch executor/handler → getExposedTools。首请求不暴露按需 MCP；搜索后加载，服务通知新增工具及修改已加载工具 schema 后，下一投影同时含新工具和新 schema；通知删除后退出投影且不能再被搜索。本例未调用模型 API。

脱敏证据保存在本机 Git 忽略目录：`.tmp/tool-search-optimization/runtime-evidence.json`、`.tmp/mcp-catalog-sync/evidence.json`、`integration-evidence.json`、`lifecycle-fencing-before.json`、`lifecycle-fencing-after.json` 和 `.tmp/tool-search-reliability/natural-phrase-evidence.json`。所有本轮临时验证源码均已删除，不保留 `.test.ts`。真实模型验收使用隔离 workspace、数据库和 storage，跳过用户配置并关闭插件，只通过原 ProviderRegistry 读取配置，未输出或复制凭据。系统 Temp 下的临时会话目录清理被自动审批审查拒绝，仅返回 `blocked by policy`，该目录保留；没有绕过清理限制。

本轮未覆盖真实外部 OAuth 服务、第三方 MCP、Desktop/手机实机断线重连、Anthropic 网络请求及 macOS/Linux。晚授权后的 Runtime 可见性由受控目录更新验证；本地 MCP 的真实连接、通知和重连验证不替代外部授权验收。

### 检查结果

- CLI 构建 11/11 tasks、根 typecheck、CLI typecheck 27/27 tasks 均通过。根 lint 为 17 条既有 warning、0 error。
- CLI 全量 lint 未通过，输出 83 个 max-lines 错误。改动源文件的定向 lint 仍报 adapter index、pool、AgentRuntime 三个原有超长文件和既有 unused/spread warning；没有关闭规则或宣称全部通过。
- 架构检查 0 baseline、0 new violations；仍属 zcode-cli unmanaged 模块。复用 adapter 的目录所有权与 Runtime 的激活状态，不新增持久化、跨端协议或跨模块依赖。当前工作区相对 HEAD 共修改 16 个生产源码文件、净增 325 行，含前一轮保留的服务筛选修复。
- freshness 已执行，但本轮 GitHub fetch 因连接重置未完成远端刷新。Node 实际 24.19.0，mise 要求 24.14.0；CLI 命令仅在当前进程补入根 node_modules/.bin，未修改依赖或全局环境。
- 改动源码及文档格式检查、git diff --check 通过；源码复扫及 Git 跟踪列表均无 `.test.ts`。原有未提交修改保留，本轮未暂存、提交或推送。

## 真实桌面验收与完整读取误判修复（2026-10-15）

### 环境与验收结果

使用用户指定的 Java 项目，真实 Electron renderer → Local Host → 当前源码构建的 Agent app-server → gpt-6.1-sol / low / OpenAI Responses。Electron 数据、业务数据、CLI 配置与会话存储均隔离，只复制必要的 Provider 配置供验收使用，结束后删除该副本。工作目录通过产品现有启动参数指定；聊天输入、单次权限确认、工具详情、变更列表和 Diff 均通过真实界面操作，未注入模型或工具执行结果。所有文件操作限定在新增的专用验收目录，未修改项目已有业务代码。

| 场景                      | 实际结果                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 模型主动发现基础能力      | 用户仅以中文要求查询已有定时任务，未提示 ToolSearch 或目标工具名。模型自行搜索 `scheduled tasks list`，加载 CronList 并执行只读查询。真实首次请求为 17 项获准常驻工具，无 CronList；下一请求为 18 项并携带其完整 schema，桌面展示空列表。                                                                                   |
| MCP 发现与执行            | 专用本地 stdio 服务正常连接后，首请求无该服务工具；模型通过 ToolSearch 发现并加载 inspect_acceptance，经界面单次许可后成功返回固定验收标记。                                                                                                                                                                                |
| MCP 目录更新              | 同一 session 内真实目录通知把已加载工具改为必填 `detail: summary`，并增加 inspect_acceptance_extra。下一轮首个实际请求即使用更新后的 schema；搜索加载新增工具后，两项能力均以正确参数执行成功。                                                                                                                             |
| MCP 目录删除              | 服务通知删除 inspect_acceptance 后，后续实际请求只保留 extra；查询结果与桌面回复均正确区分两项能力。本轮仅执行 ToolSearch，没有再调用被删除的 MCP 工具。                                                                                                                                                                    |
| ApplyPatch 初次验收       | 三次 Read 均使用 offset=0、limit=2000，极短文件已完整返回且未截断；预检却因 limit 存在而失败，0/4 操作、0 路径变更。未将此轮写成通过。要求省略参数重试时模型又产生错误路径并反复 Read，该回合已主动停止，没有文件提交；客户端 Read schema 只要求 file_path，不要求传 offset/limit，不能用归一化日志推断服务端是否另做处理。 |
| ApplyPatch 修复后桌面复验 | 重新构建 Agent、重启隔离桌面，在新 session 再用 offset=0、limit=2000 读取同样三个文件。一次 ApplyPatch 成功完成新增、修改、移动、删除全部 4 项操作，5 个路径变更；首请求已含 ApplyPatch。实际磁盘内容和删除结果正确，界面显示 5 项变更及 +3/-3，打开 Diff 正确展示 before→after。                                           |

MCP 首次失败场景仍有明确限制：首次会话启动时专用脚本尚未生成，配置已正确加载，但连接因入口不存在失败。随后补齐脚本不能通过 Desktop 的连接检查恢复该 session；连接检查属于独立 mcp-status 进程。上表的成功 MCP 场景使用另一个正常连接的 session，不冒充首次失败后的同会话恢复。用户已确认此处先补设计；[会话级恢复草案](tool-search/SPEC.md#已有会话的-mcp-失败恢复设计草案未实现)已记录目标 Runtime/lease、权限与时序，交互入口及运行中策略待冻结，未实现恢复命令。Java LSP 继续保持设计待定。

### 修复与核心验证

确认问题后先更新 ApplyPatch spec，再删除 `apply-patch-plan.ts` 中“lastRead.limit 存在即拒绝”的条件。继续检查读取起点、token 截断、实际全文内容、revision、预检截断和后续条件写入，不新增完整性状态字段或宽松兜底。生产代码仅这一处窄修复，新增 2 行、删除 6 行；其余未提交生产修改来自前轮并保留。

真实 Node FileSystemPort 与 Read handler 串联预检的 3 个核心用例，修复前 1 通过、2 失败，修复后全部通过：足量 limit 返回全文可提交；真实部分读取与 token 截断拒绝；读取后内容或版本变化拒绝。测试源码已删除。用户 Java 项目原有 60 个源码及配置文件的 SHA-256 前后完全一致；本轮专用验收文件与目录已清理。

### 证据、清理与检查

- 本机 Git 忽略目录 `.tmp/tool-search-desktop-20261015/` 保留脱敏 `model-evidence.json`、MCP 事件、文件结果、截图和检查日志。模型证据分开标注自然发现、旧失败、已停止重试、MCP 三轮及修复后复验，共 3 个 session、7 个回合、47 次 main_turn 请求、44 个唯一工具调用；请求计数包含已停止的错误路径重试，不作为产品响应速度基准。完整请求工具定义与归一化调用证据分别标注，未保存 headers、endpoint、完整系统提示或凭据到脱敏报告。
- 窄修复复验只产生 3 次 Read 和 1 次 ApplyPatch；MCP 成功调用仅返回本地固定标记。截图覆盖主动发现、预检失败、目录更新/删除、四项操作成功及 Diff。
- 临时核心用例、MCP fixture、证据提取脚本和 Provider 配置副本均删除；隔离 Electron、Host、Agent、MCP 子进程及 Vite 已关闭。原始本机隔离日志保留，不进入版本库。
- 桌面 main/host/preload 构建、Agent 重建、根 typecheck、CLI typecheck（27/27）通过。根 lint 为 17 条既有 warning、0 error；CLI lint 仍有 83 个既有 max-lines 错误。修改的生产源文件定向 lint 与格式检查通过，架构检查 0 baseline、0 new violations；本轮仍在 zcode-cli unmanaged 模块内，无跨模块依赖变化。
- 主流程 freshness 检查通过，分支与远端同步；实际 Node 24.19.0，mise 固定 24.14.0。未执行手机远程链路、外部 OAuth、第三方 MCP 或 macOS/Linux 实机验收。本轮未暂存、提交或推送。
