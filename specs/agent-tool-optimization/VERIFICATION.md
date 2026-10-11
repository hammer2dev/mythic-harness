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
