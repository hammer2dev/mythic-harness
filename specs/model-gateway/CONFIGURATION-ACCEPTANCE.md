# 模型网关配置简化验收记录

版本说明：本文按时间保留各轮实际验收事实，早期的 20 个模板、四个智普模板和能力预设描述对应当时版本，数量不回改。当前模板入口以 [2026-10-08 供应商模板去重规则](./TEMPLATE-CONSOLIDATION.md)为准，当前模型元数据与继承规则以[内置数据与能力预设整改文档](./MODEL-METADATA-IMPROVEMENT.md)为准。

日期：2026-10-07。分支：`feature/model-gateway-config`，尚未提交或推送。

## 实现结果

- 供应商名称改为连接区常显表单，Enter／失焦保存、Escape 取消，保存后同步列表、标题和模型选择；移除重命名菜单及“获取 API Key”入口。
- 添加供应商使用统一模板列表，顺序为创建自定义、OpenAI、Anthropic、DeepSeek、Kimi、MiniMax、四个智普模板，其余沿内置顺序展示；不单独突出智普。
- 供应商主页面在“添加模型”左侧提供独立获取按钮；获取只更新候选。弹窗支持目录多选、搜索保留勾选及单个手填，切换入口清空旧选择。确认后一次原子保存整批成员、启用配置和排序；取消不保存，冲突整批拒绝，失败保留选择。
- DeepSeek 官方 Anthropic 连接的目录改为同源 `/models` 与 Bearer 鉴权，解决旧 `/anthropic/v1/models` 的 404；聊天 API 格式及端点不变，第三方网关沿原目录规则。
- 简单添加不显示高级参数；未知模型可以保存，列表提供“完善配置”入口，补齐前不进入执行 Registry。
- 编辑使用轻量预设引用与稀疏覆盖。预设切换重新解析型号基线，保留用户覆盖与真实请求 ID；两个上限和参数表达式清空后恢复继承。
- 移除未知模型的通用容量和混合推理字段，UI 与 CLI 隐藏单档选择，执行仍保留合法的 `default`。
- 目录使用根 Host 已保存的连接快照、当前 revision 和原网络出口。界面隔离连接变化、供应商编辑界面卸载和迟到结果；关闭添加弹窗保留候选与当前获取。保存未结束时等待同一次操作，失败就停止获取。
- 当前配置 codec 与个人配置分发合同同步调整，移除旧手工模式，不实现历史配置迁移。
- 基础测试成功文案改为“基础请求通过”，配置变化后清除旧反馈并拒绝旧测试结果。

连接草稿由原供应商编辑组件持有，添加时的 ID 列表由 `AddModelsDialog` 持有，已有模型编辑草稿由原 hook 持有，目录由局部 `useModelCatalog` 持有。Host 配置服务与 Repository 仍是配置和 revision 的唯一所有者，Resolver 同时提供编辑继承值和可执行结果。事件顺序见[设计方案](./CONFIGURATION-IMPROVEMENT.md#4-模型目录一个读取接口)。未修改 Agent 协议、会话队列或远程恢复链路。

## 模型目录滚轮修复验收

长目录的滚轮失效原因已结合依赖源码与运行时确认：`PopoverContent` Portal 到 `body`，不属于外层 Dialog 的允许滚动区域，`RemoveScroll` 的 document 监听取消了 wheel 事件。仅在 `ModelCatalogPicker` 的 `CommandList` 阻止 wheel 冒泡，保留浏览器原生滚动；未修改共享浮层、模态焦点规则或配置写入路径。

使用 30 项合成目录和真实鼠标 wheel 输入完成隔离 E2E。修复前列表高度 288、内容高度 1043，滚轮事件 `defaultPrevented=true`，滚动位置始终为 0；修复后下滚、到底、底边继续滚、上滚、到顶、顶边继续滚的 `scrollTop` 依次为 600、755、755、155、0、0，事件均未被取消。背景页面和原滚动区域位置保持不变，搜索多选、Escape 先关闭下拉、选中标签保留及确认批量添加均通过。

测试根目录为 `C:/Users/Administrator/AppData/Local/Temp/zcode-catalog-wheel-e2e-94a81928`。复现与修复验证脚本为 `e2e-before-footer-complete.js`、`e2e-after.js`，截图位于 `output/playwright/wheel-before-fix.png` 和 `wheel-after-fix-down.png`。测试模型已删除，命名浏览器和三项隔离服务已关闭；未操作真实用户配置、API 资料、5174 开发服务或 Electron。

本轮 `pnpm typecheck`、`pnpm lint`、`pnpm architecture:check --changed` 通过；Lint 为 0 错误、17 项已有告警，架构违规／基线／新增均为 0，改动文件格式及 diff 检查通过。开工 freshness 的远端 fetch 因 GitHub 连接重置未完成，未将该检查记为通过。

## 桌面批量添加接口运行时核查

桌面曾出现 `Method not found: addPersonalModels`。源码的服务接口、服务实例及 `ServiceCollection` 动态 RPC 注册均包含该方法；当前 Host 构建也包含该方法，没有注册名单遗漏。运行中的桌面和 Host 于 17:12 启动，而接口在 22:20 修改、22:21 构建完成，旧 Host 仍保留原服务实例。Renderer 热更新或刷新只重新连接原 Host，不更新其内存代码。

完整退出并重新启动桌面开发程序后，新 Main 于 22:58:33 启动，Host utility 进程随后新建；5174 开发服务恢复监听，最新 Host 构建包含批量接口。此问题通过进程重启处理，没有新增旧单模型接口兼容或修改模型配置。核查未代替用户再次添加截图中的模型；实际批量保存的隔离 RPC／页面验证结果见本轮五项整改验收。本轮 freshness 检查已通过，相对 `origin/main` 为 ahead 22／behind 0。

## 本轮五项整改验收

隔离 Web／HTTP 服务从最新源码重新构建，目录使用合成 fixture，数据目录为 `C:/Users/Administrator/AppData/Local/Temp/zcode-gateway-polish-e2e-c83d9132/home`。页面验证未读取或修改真实用户配置，也未调用真实模型；DeepSeek 的真实目录验证单独记录在附件 API 验证中。

| 场景               | 实际结果                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 目录多选与取消     | 跨搜索勾选保留，选择不关闭下拉，标签和添加数量均为 2；取消后配置仍为 0 个模型、0 条模型规则                                                      |
| 手填与入口切换     | 手填保持单个 ID；目录与手填互相切换清空另一入口的未保存选择                                                                                      |
| 整批保存与刷新     | 一次添加 `deepseek-flash` 与 `gateway-alias`；已知模型自动解析 1M 上下文，未知模型显示待完善配置且测试禁用；刷新后两项保留，目录中已添加项均禁选 |
| 常显名称表单       | Enter 与失焦保存，Escape 还原后失焦不保存；列表和详情名称同步，刷新后保留；改名不清除已获取目录                                                  |
| 简化入口与模板排序 | 无重命名菜单和获取 API Key 入口；创建自定义至四个智普模板按确认顺序排列，没有智普独立分组                                                        |
| 390px 窄屏         | 正常收起二级侧栏后页面无横向溢出；两个选择标签、移除标签及添加按钮均可操作                                                                       |

最终清理隔离环境的两项测试模型，配置回到 0 个模型、0 条模型规则。截图位于隔离根目录的 `output/playwright/`：`template-order.png`、`multiselect-two.png`、`batch-saved.png`、`already-added-disabled.png`、`saved-after-reload.png`、`multiselect-narrow.png`、`supplier-narrow.png`。

本轮命名浏览器及 3059／5195／3062 隔离服务已关闭；未操作用户 5174 开发服务和真实 Electron。隔离 HTTP 的 Pinned 订阅仍有既知 window-controller 缺失日志，模型流程没有新增页面错误。

本轮 Node 24.14.0 下 `pnpm typecheck`、`pnpm lint`、`pnpm architecture:check --changed` 均通过；Lint 为 0 错误、17 项未修改文件的已有告警，架构违规／基线／新增均为 0。8 个核心回归通过，45 个改动文件格式检查与 `git diff --check` 通过。没有新增测试依赖、模型成员存储字段或第二条保存通道。

## 模板模型自主管理验收

按确认规则，新建模板供应商的模型列表为空；现有供应商自动继承的模板模型也取消，由用户重新选择添加。已主动添加的个人模型保留。仓库内置配置 revision 更新为 31，20 个模板移除 `builtinModelIds`，模板 schema 同步禁止该字段；连接默认值、图标和全部模型能力匹配规则保留。

生产改动限于内置配置和 Provider 模板 schema。实际模型成员仍由原 Host 配置服务与 Repository 的 `personalModelIds` 管理，Resolver／Facade 派生列表和能力；没有新增成员存储字段、写入接口或迁移路径。原添加和删除操作即可管理原模板型号，删除同时清理个人覆盖与排序项。

关键回归位于 `packages/services/test/modelGatewayConfiguration.test.ts`。旧实现会在模板新建应为空的断言处失败；整改后 2/2 用例通过。新增一条生命周期场景验证空初始化、已知 ID 的个人成员来源与能力继承、排序与连接保存、删除清理、删除最后模型、重启不恢复和重新添加；另核对模板 schema 拒绝固定成员字段。

本轮 `pnpm typecheck` 通过；`pnpm lint` 为 0 错误、17 个未改文件的原有告警；`pnpm architecture:check --changed` 的违规／基线／新增均为 0。改动文件格式检查与 `git diff --check` 通过，基线 freshness 检查重试后通过。

实际 UI 验证使用独立 Web／HTTP 服务，配置位于 `C:/Users/Administrator/AppData/Local/Temp/zcode-template-membership-e2e-a6715298/home`。服务器从本轮源码重新构建；使用合成凭据，未访问真实模型 API，也未修改真实用户配置。

| 场景                 | 实际结果                                                                           |
| -------------------- | ---------------------------------------------------------------------------------- |
| 已有与新建模板供应商 | Existing DeepSeek 与点击模板新建的 DeepSeek 均为空；默认 API 地址与格式保留        |
| 添加原模板型号       | 手填 `deepseek-flash` 后显示「已配置」，自动解析 1M 上下文与视觉能力，删除按钮可用 |
| 删除与刷新           | 删除唯一模型后为空；浏览器重新加载后保持空列表，供应商仍可编辑                     |
| 重新添加             | 同 ID 可以重新添加，能力恢复且仍可删除；再次删除后为空                             |

页面流程 8 条核心断言全部通过，最终两个供应商的个人成员和排序均为空，模型精确规则为 0。脚本为隔离目录下的 `e2e-membership.js`，截图位于 `output/playwright/`：`template-empty.png`、`model-added.png`、`empty-after-reload.png`、`model-readded.png`、`final-empty.png`。仅出现已记录的隔离 HTTP 缺少 window-controller 导致的 Pinned 订阅日志，不影响模型流程；本轮浏览器与 3059／5195 服务已关闭，用户 5174 与真实 Electron 未操作。

## 获取模型按钮外移验收

本次只调整 UI 模块的操作位置与目录生命周期：`useModelCatalog` 是供应商模型区候选和请求状态的唯一所有者；主页面按钮沿用原准备连接、读取 revision 和目录请求路径，弹窗仅消费候选。连接变化或编辑界面卸载拒绝旧结果，弹窗开关不影响目录。

使用全新隔离 Web 页面、HTTP 服务与合成目录进行 Playwright 验证，配置目录为 `C:/Users/Administrator/AppData/Local/Temp/zcode-catalog-button-58da6910/home`，未操作真实用户配置或调用真实模型 API。

| 场景               | 实际结果                                                                         |
| ------------------ | -------------------------------------------------------------------------------- |
| 主页面获取         | 按钮位于“添加模型”左侧；获取后显示 2 个候选，无弹窗、无模型写入                  |
| 弹窗选择与取消     | 弹窗没有获取按钮，可选择真实 ID；关闭、重新打开后候选保留，目录请求计数不变      |
| 获取期间关闭弹窗   | 获取按钮禁用重复点击；取消弹窗后当前请求仍成功更新主页面候选                     |
| 连接变化与迟到结果 | 修改连接后清除旧候选；旧慢请求返回不会覆盖新连接的失败反馈，手填 ID 仍可用       |
| 390px 窄屏         | 收起二级侧栏后两个主页面按钮与弹窗操作均可用，无页面横向溢出；按钮按可用宽度换行 |

窄屏初次验证从桌面尺寸直接缩小，展开的二级侧栏遮挡了点击；通过正常的侧栏开关收起后完成交互验证。隔离配置最终仍有 0 个个人模型和 0 条模型规则，证明获取、选择和取消没有写入模型。

截图位于上述临时根目录的 `catalog-main.png`、`catalog-main-narrow.png` 和 `catalog-dialog-narrow.png`。本次 `pnpm typecheck`、`pnpm lint`、`pnpm architecture:check --changed` 均通过；Lint 为 0 错误、17 项未改文件中的已有告警。未增加测试依赖或扩展网络接口，未验证真实手机远控或其他操作系统。

## 基础简化的页面验证

使用独立 HTTP 服务 `127.0.0.1:3049`、Vite `127.0.0.1:5193` 和合成目录服务 `127.0.0.1:3058`。数据目录为 `C:/Users/Administrator/AppData/Local/Temp/zcode-gateway-config-20261007/home`，未修改真实用户配置。浏览器与测试服务已关闭。

| 场景                       | 实际结果                                                                                            |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| 新增、自定义名称与重新进入 | “测试网关 A”在列表、详情与聊天模型入口一致，重新加载后保留                                          |
| 连接保存、打开下拉和搜索   | 不自动获取目录；合成服务计数仅在点击获取按钮后增加                                                  |
| 搜索选择与重复 ID          | Enter 选中候选但不添加；已添加的 `gpt-5.4` 标记并禁用                                               |
| 取消与未知模型             | 取消候选不保存；手填 `gateway-alias` 可添加，测试按钮禁用并显示完善入口                             |
| 预设切换与补齐             | 选择 Claude 预设后改为自定义文本预设，手动 64000 上限保留；补齐输出 4000 后配置可用，实际 ID 未变化 |
| 迟到结果和失败备用         | 关闭慢目录请求并更换连接后，旧结果不覆盖新错误；失败仍可手填，原响应中的合成 Key 不回显             |
| 加载和 Escape              | 获取期间按钮禁用；Escape 先关闭下拉，添加弹窗继续打开                                               |
| 窄屏                       | 390×360 中输入、取消与添加可达，取消不落盘；截图为测试根目录下 `add-narrow.png`                     |

验证中修复了 Enter 在输入框提前拦截导致无法选中候选的问题，以及未知容量和条件渲染产生的多余“0”。保存成功后新模型行滚入可见范围。

## 附件 API 验证

凭据仅从用户附件在内存中读取，不写入源码、测试配置、截图或验收记录。目录返回 ID 不用于推断容量。每个供应商只验证选定模型的短文本请求，不代表所有模型或能力均通过。

| 供应商     | 目录                             | 正式 SDK 短文本请求                                                                                  |
| ---------- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 硅基流动   | OpenAI 目录成功，97 个 ID        | Chat Completions，`deepseek-ai/DeepSeek-V4-Flash` 成功并收到 `stop`                                  |
| Sub2Api    | OpenAI 目录成功，10 个 ID        | Responses，`gpt-5.6-luna` 成功并收到 `stop`                                                          |
| DeepSeek   | 修复后官方目录 HTTP 200，2 个 ID | 手填 `deepseek-v4-flash`，Anthropic Messages 成功并收到 `stop`                                       |
| CommonCode | OpenAI 目录成功，85 个 ID        | 所测 `claude-sonnet-5` 请求被服务端拒绝：Anthropic HTTP 403，Chat HTTP 400；未确认原因，不算接入通过 |

模型请求使用当前内置规则解析与 `AiSdkModelExecution.bindModel / resolveRequest` 的正式参数映射，输出上限 16、最低推理档位、无自动重试。此项验证和应用原有 1 Token 连通性按钮分开记录。

DeepSeek 最初的标准 Anthropic 目录请求返回 404；本轮按其官方独立目录合同修复后，使用同一授权附件的 Key，通过当前 `createModelCatalogReader` 实际发起一次目录 GET，返回 HTTP 200、2 个模型 ID。本次只验证目录读取，没有再次调用聊天模型。

## 代码验证

- Node 使用 `mise.toml` 指定的 24.14.0；开工 freshness 与实施前架构检查通过。
- `pnpm typecheck`：通过。
- `pnpm --dir apps/zcode-cli typecheck`：将根目录 `node_modules/.bin` 加入本次 PATH 后通过，27 项任务成功，其中 26 项使用缓存。Turbo 提示 CLI lockfile 缺少 browser-use-plugin 条目；未修改依赖。
- `pnpm lint`：0 错误，17 项未修改文件中的已有告警。
- `pnpm architecture:check --changed`：通过，违规／基线／新增均为 0。改动涉及 provider、provider-node、services、shared、ui 和 zcode-cli。
- 当前改动文件格式检查与 `git diff --check`：通过。
- 核心回归测试 8 项通过：目录读取 4 项（包括 DeepSeek 官方路径与第三方边界）、配置 3 项（包括批量生命周期与冲突原子性）、UI 编辑草稿 1 项。

实际测试入口：

```text
TSX_TSCONFIG_PATH=packages/services/tsconfig.json
node --import tsx --test packages/services/test/modelGatewayConfiguration.test.ts packages/services/test/modelCatalog.test.ts

TSX_TSCONFIG_PATH=packages/ui/tsconfig.json
node --import tsx --test packages/ui/test/providerModelDraft.test.ts
```

用户原有的 `packages/services/test/publicClientPolicy.test.ts` 暂存删除保持原状；本轮没有提交或推送。

## 验证边界

- 未启动原生 Electron，也未实测 macOS、Linux、真实手机远控或远端 Host 分发；分发合同通过序列化 round trip 验证。
- 保存失败阻止目录读取的路径经过代码核对，未注入真实界面的配置写入失败。未验证代理与自定义 CA 的真实网络环境；装配复用原 Host 网络出口。
- 隔离 HTTP 服务缺少桌面 window-controller channel，浏览器保留已有的 pinned 列表加载错误；模型网关交互完成后没有新增页面错误。
- 额外执行的旧 `providerConfigMigration.test.ts` 失败：它仍导入已不存在的 `legacyZCodeConfigProviderReader.js`。未恢复旧模块或修改该失效测试。
- `pnpm knip` 返回仓库现有的未使用文件、依赖与导出问题，未作为全仓清理任务处理；本轮删除的旧配置导出通过不限定包范围的 `dep:refs` 核对引用。

## 2026-10-08 内置数据与能力预设移除验收

对应 [本轮整改文档](./MODEL-METADATA-IMPROVEMENT.md)。直接更新内置 revision 32，删除能力预设闭包；不接入 Models.dev、不修改独立输入预算、不添加旧配置迁移。

### 关键回归

```text
pnpm exec tsx --test packages/services/test/builtinModelMetadata.test.ts packages/services/test/modelGatewayConfiguration.test.ts packages/services/test/modelCatalog.test.ts packages/ui/test/providerModelDraft.test.ts
```

12 项全部通过：内置元数据 3 项、配置保存与成员 4 项、模型目录 4 项、UI 草稿 1 项。完整解析会校验 JSON Schema 和每条参数表达式；新增型号容量、停服条目清理、未知版本不误匹配、Spark 不误套普通 Codex、真实 URL 的能力差异与第三方端点覆盖都有核心断言。

### 实际界面验证

在独立临时配置目录运行 HTTP 3059 与 Web 5195，使用合成密钥及 `.invalid` 地址，不调用真实模型 API。

- `gpt-5.6-sol` 继承 1,050,000/128,000，个人输入为空，不将默认值复制进配置。
- 个人覆盖 64,000/4,000 保存后重开正确；清空后恢复内置继承。
- 修改后取消，配置文件 SHA256 保持一致。
- 未知 `metadata-private-alias` 补齐两项上限后通过完整配置校验，刷新后 ID 和个人值保留。
- 基础和高级编辑器均无能力预设。
- 新添加 `gpt-6.1-sol` 自动继承 1,050,000/128,000，个人规则仅存 `{ enabled: true }`。

截图已实际检查，证据位于 `C:/Users/Administrator/AppData/Local/Temp/zcode-metadata-e2e-20261008-6b9d142a/output/playwright/`：`known-inherited.png`、`unknown-completed-reopened.png`、`new-model-inherited.png`。验收结束后通过 UI 删除三条测试模型，关闭浏览器和隔离服务，确认两个端口均已释放；真实用户配置与开发进程未操作。

### 工程检查与限制

- Node 使用 24.14.0。freshness 的远端 fetch 因 GitHub 网络失败；`--no-fetch` 检查通过，当前基线 ahead origin/main 22、behind 0，分支尚无 upstream。
- 根 `pnpm typecheck` 通过。
- CLI `pnpm --dir apps/zcode-cli typecheck` 初次因 PATH 未找到 Turbo 失败；将根 `node_modules/.bin` 加入本次 PATH 后通过，27 项成功、27 项使用缓存。保留本地 Turbo 缺失与 CLI lockfile 缺少 browser-use-plugin 条目的环境提示，未修改依赖。
- `pnpm lint`：0 错误、17 条未修改文件中的已有告警。
- `pnpm architecture:check --changed`：0 违规、0 基线、0 新增。
- 本轮改动文件格式检查与差异检查通过；生产源码无能力预设字段、目录、选择器及文案键残留。
- 未运行真实供应商推理请求、原生 Electron、手机远控或跨 Host 分发。官方非流式 Pro 型号只补已确认元数据，没有新增非流式适配；K2.6/K2.7 未确认输出上限仍需手填。隔离 HTTP 的既有 window-controller 缺失告警仍存在，模型设置交互未新增页面错误。
- 原有图标等本地改动、`publicClientPolicy.test.ts` 暂存删除保持原状。本轮没有提交或推送。

## 2026-10-08 供应商模板去重验收

对应 [供应商模板去重规则](./TEMPLATE-CONSOLIDATION.md)。内置 revision 更新为 33，添加入口为自定义及 12 个品牌，BigModel 与 Z.ai 分开。模板仍来自内置配置，未新增分组、协议自动切换或被删模板的兼容迁移。

### 实际界面验证

使用独立临时个人配置与最新源码构建的 HTTP 3063、Web 5197 完成关键 E2E。API Key 保持为空，修改地址使用合成 `.invalid` 域名；未获取真实目录、未调用模型 API，未操作用户配置或真实桌面开发程序。

| 场景                 | 实际结果                                                                                                                                                                        |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 添加入口数量与顺序   | 恰好 13 项：创建自定义供应商、OpenAI、Anthropic、DeepSeek、Kimi、MiniMax、BigModel、Z.ai、阿里百炼、Xiaomi、xAI、OpenRouter、OpenCode；各品牌仅一个入口，无套餐、地区或协议后缀 |
| OpenCode 默认配置    | 新建后名称为 OpenCode，地址为 `https://opencode.ai/zen/go/v1`，API 格式为 Responses，模型列表为空                                                                               |
| 连接修改与重新进入   | 修改名称、合成地址和 Chat Completions 格式后，个人配置正确落盘；完整刷新并重开详情，三项值均保留                                                                                |
| 同品牌多个个人供应商 | 仍可从同一个 OpenCode 入口创建第二个实例并独立命名；第二个保留 Go/Responses 默认值，刷新后两者名称与连接互不影响，模型列表均为空                                                |

测试目录为 `C:/Users/Administrator/AppData/Local/Temp/zcode-template-consolidation-e2e-20261008-9f81c063`。四张截图已实际检查：`output/playwright/template-menu-13.png`、`opencode-defaults-empty.png`、`opencode-edited-reopened.png`、`opencode-two-instances.png`。验收结束后已关闭命名浏览器，停止本轮 HTTP 与 Vite；确认 3063、5197 无监听，已记录的两项服务进程均已结束。

### 工程检查与限制

- Node 使用 24.14.0；本轮 `node scripts/check-workspace-freshness.mjs` 含远端 fetch 正常通过，基线 ahead origin/main 22、behind 0，分支尚无 upstream；根 `pnpm typecheck` 通过。
- `pnpm lint` 为 0 错误、17 条未改文件中的原有告警；`pnpm architecture:check --changed` 为 0 违规。
- 元数据、目录、配置与草稿回归 12 项通过；本轮内置配置模板断言通过。
- 完整 `customModelProvider.test.ts` 为 1 通过、1 失败。未改的 CLI Key 用例在本轮修改前已失败：`auth-api-key.ts:79` 报“模板没有可执行模型”，该用例仍假定新建模板自动附带模型。本轮未扩大模板去重范围修复此用例，未将完整文件记为通过。
- 本轮 10 个文件格式检查与 `git diff --check` 通过。
- 隔离界面首次启动于 12:14:45 记录到 `OnboardingDialog` Hook 顺序变化错误及局部 ErrorBoundary 错误；本轮未修改新手引导代码，后续完整刷新未再出现该错误。HTTP 环境仍有既有 `window-controller` 缺失告警。模板菜单、创建、修改、重开及重复实例的关键场景均已实际通过，不据此声称页面全程无错误。
- 未运行原生 Electron、真实模型请求、手机远控或跨 Host 分发；保留已有个人配置与其他本地改动，本轮没有提交或推送。

## 2026-10-08 分组提交前检查

- 根 `pnpm typecheck`、`pnpm verify:pre-push` 通过；根 Lint 仍为 0 错误、17 条原有告警，架构为 0 违规。
- CLI `pnpm --dir apps/zcode-cli typecheck` 通过，27 项使用缓存；保留 Turbo 安装位置与 CLI lockfile 缺项的环境提示。
- CLI `pnpm --dir apps/zcode-cli lint` 未通过；Contracts、Core、Adapters、Telemetry 等未改文件存在 `max-lines` 错误，未扩大本次提交范围整改。不能将 CLI 独立 Lint 记为通过。
- 当前 53 个文本改动文件格式检查通过。上述已有失败与前节 CLI Key 测试失败保持记录，不用删除其他测试或放宽规则使检查通过。

## 2026-10-08 硅基流动模板验收

对应 [供应商模板规则](./TEMPLATE-CONSOLIDATION.md)。本轮内置 revision 更新为 34，新增 `siliconflow` 一个模板，中文为“硅基流动”、英文为“SiliconFlow”，位于 OpenCode 后；当前为自定义入口加 13 个品牌。前一轮 revision 33 的 12 品牌验收事实保持原样。

### 实际界面验证

使用独立临时个人配置与最新源码构建的 HTTP 3065、Web 5199 完成关键 E2E。API Key 始终为空，修改地址为合成 `.invalid` 域名；未点击获取目录或测试模型，未请求真实供应商 API，未操作用户配置或真实桌面开发程序。

| 场景           | 实际结果                                                                                                |
| -------------- | ------------------------------------------------------------------------------------------------------- |
| 菜单入口       | 恰好 14 项，原顺序保留，硅基流动只有一个入口且位于 OpenCode 后                                          |
| 默认连接       | 新建名称为“硅基流动”，地址为 `https://api.siliconflow.cn/v1`，API 格式为 Chat Completions，模型列表为空 |
| 品牌图标       | 菜单、供应商列表与详情显示紫色官网图形；图片实际加载成功，两处原始宽度为 193，未显示 Package 回退图标   |
| 编辑与重新进入 | 将名称、合成 URL 与 API 格式修改后，个人配置正确落盘；完整刷新并重开详情，三项值均保留，模型列表仍为空  |

测试目录为 `C:/Users/Administrator/AppData/Local/Temp/zcode-siliconflow-template-e2e-20261008-c3575b10`。三张截图已实际检查：`output/playwright/template-menu-14.png`、`siliconflow-defaults-empty.png`、`siliconflow-edited-reopened.png`。验收后通过界面确认删除唯一测试供应商，个人配置恢复为 0 个供应商、0 条模型规则；命名浏览器、HTTP 与 Vite 均已关闭，3065、5199 无监听，本轮两项服务进程均已结束。

### 工程检查与限制

- Node 使用 24.14.0；根 `pnpm typecheck` 通过。
- `pnpm lint` 为 0 错误、17 条未改文件中的原有告警；`pnpm architecture:check --changed` 为 0 违规。
- 内置配置关键模板测试 1/1 通过；修改前，新增的 13 模板预期对原 12 模板数据失败，实施后通过。
- 本轮 9 个文本文件格式检查和 `git diff --check` 通过；官方 SVG 原字节保留。状态与保存路径沿用原 Host 配置服务，改动仅涉及模板数据、UI 资源映射及规范和验收记录。
- freshness 的远端 fetch 因 GitHub 连接重置失败；`--no-fetch` 检查通过。当前相对 `origin/main` 为 ahead 26、behind 0，并与已保存的 `origin/feature/model-gateway-config` 同步，未将 fetch 记为通过。
- 本轮首次启动仍记录到既有 `OnboardingDialog` Hook 顺序及局部 ErrorBoundary 错误，完整刷新后未再出现；隔离 HTTP 仍有 `window-controller` 缺失告警。新增模板的关键界面场景均已实际通过，不据此声称页面全程无错误。
- 未验证真实目录、模型推理、原生 Electron、手机远控或跨 Host 分发。本轮没有提交或推送代码，其他个人配置与本地改动保持原状。

## 表单控件高度统一（2026-10-08）

- 源码确认名称、模型目录选择与手填 ID 原用默认 28px，API Key 的局部 `h-9` 覆盖为 36px；统一使用已有 `lg`（32px），共修改三个 UI 组件。规则先更新至配置简化方案，草稿和保存仍由原组件及 Host 服务负责。
- 隔离 HTTP/Web 页面在 1280×900 与 390×844 下实测：名称、Base URL、API 格式、API Key、模型目录选择、手填 ID、上下文和输出上限共八个控件均为 32px。连接字段文字、密钥可见性图标与 API 格式箭头显示正常。
- 两种视口的模型下拉都能打开，真实鼠标滚轮使列表 `scrollTop` 从 0 增至 450.4；手填和上限弹窗正常打开、取消。名称失焦保存后，完整刷新仍保留。
- 证据保存在 `C:/Users/Administrator/AppData/Local/Temp/zcode-control-sizes-e2e-20261008-67c5d8a1/output/playwright/`，关键截图为 `connection-height-desktop.png` 与 `connection-height-narrow.png`。本轮只测修改后尺寸，不将源码判断记为修改前页面实测。
- 根 `pnpm typecheck`、`pnpm lint`、`pnpm architecture:check --changed` 通过；Lint 为 0 错误、17 条原有告警，架构为 0 违规。目标文件格式检查、`git diff --check` 通过；freshness 含远端 fetch 正常通过。
- 验证使用本地目录 fixture 与假密钥，未请求真实模型或操作用户桌面会话。测试供应商已删除，浏览器及三项测试服务关闭，3067／5201／3070 端口已释放；未验证原生 Electron 或手机远控。本轮未提交、推送代码。
- 隔离环境仍有既有 `OnboardingDialog` 和 `window-controller` 错误；本轮控件尺寸与指定交互通过，不据此声称全页面零错误。
