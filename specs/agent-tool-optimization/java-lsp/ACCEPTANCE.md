# Java LSP 核心验收

状态：`partial`，实现已落地，核心、真实 JDT 与 Windows 桌面主链已验收；完整发行安装包、其他平台和复杂项目组合仍有未覆盖项。更新：2026-10-16。所属专项见 [Agent 工具优化](../SPEC.md)，产品决策与状态所有者见 [SPEC.md](SPEC.md)。默认启用、按需启动、禁用与工具资格验收见 [通用代码开发插件](../code-development-plugin/SPEC.md#9-核心验收计划)，复用下列 Java fixture。

仅保留能证明产品边界的代表场景，不建立操作 × 平台 × Java 版本的穷举矩阵。当前验证为 Windows x64、Java 17 代表项目、固定 JDT LS/m2e 与 Gradle 9.2.0、项目 Lombok 1.18.30 与随包 agent 1.18.48。下列场景不代表已承诺所有构建类型、Java 8–25 全版本或其他注解处理器兼容。

## 核心场景

| ID      | 准备                                                                                                                                                | 操作                                                                                               | 核心断言                                                                                                                                                                                  | 所需证据                                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| JLSP-01 | 安装包含对应平台 Java 资源的应用；断网；没有满足 JDT LS 启动要求的系统 Java；准备一个已配置项目 JDK 的本地 fixture                                  | 先搜索/加载 LSP，再首次查询 Java 符号                                                              | 插件默认启用，搜索/加载不启动进程；查询从随包 runtime 按需启动，无首次下载；项目 JDK 与 tooling runtime 分别可见；不修改全局 JAVA_HOME/PATH                                               | 安装产物 manifest、启用/曝光状态、进程路径与启动日志、查询结果        |
| JLSP-02 | Maven 多模块与 Gradle fixture；执行端已安装两个项目 JDK；同项目子目录及构建约束不同的 worktree；Gradle daemon JVM 与编译 toolchain 使用不同兼容版本 | 自动导入多个工作目录并查询跨模块定义、引用与符号                                                   | 无需逐目录设置；候选发现可复用但各构建根/分支按当前约束匹配；不把 release/source 直接当 JDK 版本；构建 JVM 选择独立                                                                       | 候选来源、各构建根的有效模型与 JDK 映射、查询结果                     |
| JLSP-03 | 项目 JDK 缺失，tooling runtime 正常；准备有效路径、同执行环境的另一项目及可恢复的会话                                                               | 先跳过或让提问自动结束，再在对话提供路径并重试；重启后从另一项目/工作目录发起查询                  | 跳过/空回答不写配置；有效路径默认持久登记为环境级候选，保存成功才反馈已记住；其他项目按自身约束复用，不被固定到该 JDK；无设置页步骤；不下载或改用 tooling runtime；保存与导入结果分别可见 | 真实回答来源、环境级登记、恢复后各项目的匹配来源、重试结果            |
| JLSP-04 | 未启动语言服务的跨文件 Java fixture；准备一次 ApplyPatch 部分成功                                                                                   | 首次 Edit/Write 后立即查询，再执行部分成功补丁；以 Bash/外部写入修改相关文件，包含一次重命名或删除 | 首次提交触发诊断需求；查询反映已提交版本，补丁未提交项不发同步；旧 buffer、旧 URI、依赖变化前的诊断失效；不能通过固定等待时间使测试通过                                                   | 实际提交结果、revision、启动与同步顺序、真实 LSP 查询/诊断            |
| JLSP-05 | 已有有效诊断基线；准备新增类型错误、修复错误及晚到的旧通知                                                                                          | 连续编辑并在工具批次边界接收摘要，同时主动查询诊断                                                 | 每次合并展示新增/加重问题，不重复整表；旧结果不覆盖新结果；未完成与当前空诊断可区分；无基线不声称错误由本次修改引入                                                                       | 会话事件、文档版本、摘要与主动查询结果                                |
| JLSP-06 | 两个 path 相同但 identity 不同的工作区；同 owner 主会话与 headless 子代理；手机连接已有 attachment                                                  | 子代理遇到缺失 JDK 后由父会话处理；手机提交配置并断开重连，随后关闭真正的 owner                    | 子代理不独自悬挂提问；执行端保存一次，replay 不再次写配置；identity 不串线；同 owner 复用服务；-data 独占；owner 关闭清理进程                                                             | workspace/remoteSessionId 路由、交互和配置提交记录、进程数、V4 replay |

## 当前逐项覆盖

| ID      | 状态    | 已有证据                                                                                                                                                              | 尚未覆盖                                                                                         |
| ------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| JLSP-01 | partial | 真实 stdio 加载随包扩展；Windows x64 资源 staging/SEA 采集；core 验证两工具按需，真实桌面模型 ToolSearch→LSP 查询成功。                                               | 完整安装包断网、无系统 tooling Java 条件及其他四个平台实机。                                     |
| JLSP-02 | partial | Java 17 Maven/Gradle 多模块跨模块定义、workspace symbol、Lombok getter 消费、错误及修复后的 current 诊断；Gradle 9.2.0。                                              | 多 worktree 不同构建约束、模块使用不同 JDK、daemon JVM 与 toolchain 不同版本及更多构建插件组合。 |
| JLSP-03 | partial | JdkStore 真实路径/版本发现、登记/选择和歧义处理；当前用户输入/真实答案证明、无效来源不写、显式 deny、已有意图不重复确认的 core 验证。                                 | 完整桌面配置保存及冷恢复/另一项目复用的结果由主验证记录补充，不能用单元结果代替交互验收。        |
| JLSP-04 | partial | 真实 adapter 首次编辑启动；core ApplyPatch 部分成功只登记成功项、取消后已提交项；Maven CRLF 当前诊断，analyze:false child/已禁用 lease 修改后共享服务跨文件结果更新。 | 完整桌面编辑链、rewind 与真实 LSP 的组合、Bash/外部修改及重命名/删除组合仍未全部覆盖。           |
| JLSP-05 | partial | 真实扩展错误→修复空诊断、hash 不符 stale、取消后恢复；adapter 待投递诊断；core 首次基线、差异与截断不误报已解决。                                                     | 连续桌面编辑的模型可见摘要、晚到通知与冷恢复后的完整展示链仍按主记录验收。                       |
| JLSP-06 | partial | 真实共享 lease、禁用一个 lease 后另一个继续查询；core 受限目录、child analyze:false 不启动服务；配置 watcher 首次创建、原子替换、workspace override 与卸载抑制。      | 相同 path 不同 identity 的完整进程隔离、手机附件重连/配置 replay、远端执行与 owner 关闭整链。    |

真实桌面 E2E 的最新结果统一维护于 [验证记录](../VERIFICATION.md)；本表保留整项仍未覆盖的边界，不因单个子场景通过将整项标为 passed。

2026-10-16 桌面补充验收：真实模型已完成 ToolSearch→LSP 符号/当前诊断、JavaRuntime 明确路径直接保存且不重复确认、首次编辑 pending 与服务就绪后的自动类型错误摘要、原会话插件停用后的工具移除及 JDT 退出、冷启动继续停用、重新启用后复用已登记 JDK 并查询 current 诊断。上述结果补齐 JLSP-03/04/05 的桌面主链；缺少项目 JDK 的完整对话交互、另一项目复用、多 worktree 与真实手机/远端设备仍未全覆盖。

`code_diagnostics` 已通过真实 Runtime/SQLite/ConversationTopicPublisher 的桌面快照、手机增量重连和冷 hydrate 验证：保留原摘要、来源、metadata 和 turn 锚点，不伪造用户行、不重放配置写入，也不产生额外模型 turn。这是协议验证，不替代真实手机设备验收。

## 测试分层与证据

- 合同/单元：输入位置转换、JDK 角色与匹配结果、对话配置输入与持久提交边界、诊断版本/去重规则。只覆盖影响语义的分支。
- 集成：用锁定 JDT LS 和受管 runtime 实测启动、导入、文档同步、导航和诊断；不能仅用模拟通知证明语言服务已经处理新版本。
- E2E：当前对话提供 JDK 路径并保存后恢复分析、Agent 编辑后显示诊断摘要、手机重连不重复配置提交。复用上述核心场景，区分已执行子场景和未覆盖链路。
- 平台：各发布目标验证资源可执行与关闭回收；完整语言操作集中在代表平台，额外覆盖 Windows URI/Unicode 路径及位置编码，不复制整套矩阵。

同一 fixture 可同时覆盖导航和符号操作；无需每个 operation 单独复制一个项目。受管资源损坏、server 退出和导入失败只保留能区分失败状态并证明不会伪报成功的代表用例。

## 当前验证入口与缺口

- 根目录已存在 `pnpm typecheck`、`pnpm lint`、`pnpm architecture:check --changed`。
- CLI 已存在 `pnpm --dir apps/zcode-cli typecheck`、`pnpm --dir apps/zcode-cli lint`。
- `@zcode/core`、`@zcode/adapters` 没有统一 `test` 命令；本次用临时核心验证与真实 JDT fixture 执行，脚本清理后只保留证据，不假设存在 `pnpm test:lsp`。
- `.tmp/java-extension-verification-20261016/evidence.json`：真实扩展注册、错误/修复、hash 不符、取消与关闭文档。
- `.tmp/code-plugin-resource-verification-20261016/evidence.json`：Windows x64 资源准备/staging/SEA 收集、目标不匹配、Windows ARM64 unsupported 无下载/编译。
- `.tmp/java-resources-20261016/adapter-1792149757882/evidence.json`：首次编辑启动、诊断更新、共享/禁用 lease 与添加候选。
- `.tmp/java-build-projects-20261016/maven-runs/1792150481998/evidence.json`：Maven 多模块/Lombok、CRLF 与受限/禁用 lease 提交同步；`gradle-runs/1792150558719/evidence.json`：Gradle 9.2.0 多模块/Lombok。
- `.tmp/plugin-policy-jdk-20261016/`：`evidence.json`、`intent-evidence.json`、`integration-evidence.json`、`java-runtime-approval-evidence.json` 分别保留配置/JDK、真实输入、core 集成与重复确认修复证据。
- 文档校验不等于运行验收；全仓 typecheck/lint、真实桌面步骤与最新结果由 [验证记录](../VERIFICATION.md) 聚合，已有失败不得写成通过。
