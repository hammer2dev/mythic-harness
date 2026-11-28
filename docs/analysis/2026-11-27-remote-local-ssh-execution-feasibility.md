# 远程连接改造评估：本地 Host + SSH 直连替代远端 ZCode Server

- 调查日期：2026-11-27。
- 范围：评估「取消远程设备安装 ZCode Server daemon，改为本地通过 SSH 连接直接操作远端项目」的可行性、影响面与代价。
- 方法：全仓扫描桌面端远程栈、`zcode-server-cli`、UI/身份/配置、测试/发布/文档四条链路，并对照 R1/R2/R3 规格与目标架构文档。
- 状态：调查报告，未实施改动。所有结论基于当前检出，路径与行号可复核。

## 0. 结论

**技术上可行，但不建议按「本地 Agent + SSH 逐条代理」直接替换现有远程主链。** 这不是删掉一个安装步骤，而是更换整套执行模型：收益集中在「免安装、免版本兼容、无远端 Node 依赖」，代价是重写 Agent 执行层与文件/终端/Git/监听四条基础服务、丢失「断连任务继续运行」与多端共享任务等核心承诺，并且净工作量大于现有实现。

三个结构性事实决定了这一点：

1. **远端跑的不是代理，是完整产品**。远端 Core 用与本地 Host 完全相同的 `createLocalServices` 装配（`packages/services/src/node.ts:3467-3522`），文件、终端、Git、监听、Agent 全部是 `node:fs` / `node-pty` / `child_process` / `node:sqlite` 的本机实现；Agent CLI 以 `cwd = workspacePath` 在同一台机器上 spawn（`packages/services/src/zcode-agent/zcodeAgentProcessManager.ts:1260-1267`、`zcodeAgentSpawnCwd.ts:4-25`）。
2. **本地侧没有任何「远程文件系统 / 远程 PTY / 远程 Git / 远程工具执行」抽象**。本地 Host 与远端 Core 共用同一套服务实现，写死本机调用；远端能力之所以成立，是因为整个服务栈 + Agent 都部署在远端。
3. **现有 SSH 原语很浅**。`IRemoteBackend` 只有 `detect / upload / exec / exists / readFile / forwardOut`（`packages/server/src/remote/backend.ts:32-54`），没有目录遍历、流式下载、写文件、rename/delete、watch、PTY、后台任务句柄。它足以「装一个 server 并打隧道」，不足以直接充当远端文件系统。

因此「远端不装任何 ZCode 组件」只有两条路：

- **A. 本地跑 Agent，所有工具调用/文件 IO/终端逐条走 SSH** —— 即用户描述的方案，需要新建一整套远端执行层，代价最大；
- **B. 远端仍跑 Agent，只是不常驻、不注册服务**（按需上传 CLI）—— 仍然要在远端放组件，还丢失断连续跑，属于「改了安装形态，没改本质」。

行业参照：VS Code Remote-SSH、Cursor Remote、JetBrains Gateway、ZCode 现有方案，全都选择「在远端运行一个 server，客户端只做控制面」。没有一个成熟产品做到「远端零组件 + Agent 全功能」。

## 1. 当前远程架构事实

### 1.1 拓扑

```text
Desktop Renderer
   │  RPC（38 个频道）
   ▼
Window Host（本地进程）
   ├─ LocalSource ── stdio ── 本地 Agent CLI
   └─ SourceServerConnectionManager
        ├─ TransportAdapter(ssh|wsl|docker)
        │    probe → (确认后 install/update) → ensureDaemon → 读 ingress-token
        │    openChannel：SSH forwardOut 到 127.0.0.1:<port>，或 proxy-stdio
        ├─ 握手：/api/server-info → capability ticket → WS /ws/host
        └─ RemoteServiceAccess（薄客户端）
                              │
                              ▼
                  远端 ~/.zcode/server（R2 daemon）
                  Supervisor → Server Core → createLocalServices
                                    └─ 每个 workspace 一个 Agent CLI
```

关键点：Desktop 断开只释放 attachment，daemon 与任务继续运行（R3 §4）。这不是可选优化，而是产品承诺。

### 1.2 远端 Core 承担的职责

| 类别 | 具体服务 | 实现依赖 |
| --- | --- | --- |
| 文件 | `IFileService`、`IMediaPreviewService`、文件搜索索引 | `node:fs/promises` |
| 监听 | `IFileWatcherService` | `node:fs.watch` |
| 终端 | `ITerminalService` | `node-pty` |
| Git | `IGitService`、`IGitCheckpointService`、`IManagedWorktreeService` | 本机 `git` CLI |
| 任务/会话 | `IZCodeTaskService`、`IZCodeSessionService`、`IZCodeAgentService` | 本机 sqlite + Agent 子进程 |
| 配置/凭据 | `ISettingService`、`ICredentialService`、`IProviderSettingsService`、`IOAuthService` | `~/.zcode/v2` |
| 扩展面 | skills / MCP / plugins / commands / hooks / subagents / memory / output-style / settings-sync | 远端文件与 CLI |
| 其他 | 系统信息、用量统计、套餐、bots、会话分享、生成式 UI | 本机网络与文件 |

### 1.3 本地 Host 与远端 daemon 之间的 38 个 RPC 频道

合同定义在 `packages/desktop/src/host/remoteWorkspaceRpcContract.ts:5-44`，握手时逐项校验：

```text
fileService genUiService gitService gitCheckpointService systemService terminalService
settingService onboardingRecordService credentialService broadcastService
zcodeTaskService zcodeAgentService zcodeSessionService conversationShareService botsService
fileWatcherService oauthService providerSettingsService modelSelectionService mediaPreviewService
sourceServerWorkspaceService usageStatsService codingPlanSubscriptionService clientScenesService
skillsService skillSyncService mcpSyncService pluginSyncService userConfigSyncService
pluginsService pluginManagementService subagentsService commandsService hooksService
memoryService outputStyleService settingsSyncService promptAttachmentTransferService
```

另有反向资源频道 `host-topic-resource`（`channels.ts:425`），用于远端回取附件/媒体资源。

### 1.4 连接建立的真实步骤

`sourceServerConnectionManager.ts:1214-1663` 的 `connectOnce`：

1. admission 与在线连接复用；
2. `adapter.probe`：读平台、架构、安装状态、版本、daemon 状态；
3. 未安装 → 解析发行包 → 用户确认 → 上传（约 90MB）或远端直下 → `zcode update --from-archive`；
4. `ensureDaemon`：`serve --daemon`（systemd/launchd 优先，失败退 detached）→ 读 `run/ingress-token`；
5. `openChannel` → `/api/server-info` → capability ticket → `WS /ws/host`；
6. 兼容性复核 → `recordHandshake`（回填 `sourceServerId`）→ 发布 online；
7. 失败按 2/4/8 秒重试，离线每 120 秒探测。

### 1.5 现有可复用的 SSH 能力

| 能力 | 位置 | 能做什么 | 缺什么 |
| --- | --- | --- | --- |
| `IRemoteBackend` | `packages/server/src/remote/backend.ts:32-54` | detect / upload / exec / exists / readFile / forwardOut | 目录、stat、写文件、rename/delete、流式下载、watch、PTY |
| `SSHBackend` | `ssh-backend.ts:96-655` | ssh2 exec（`/bin/sh`）、SFTP 上传（回退 `cat >`）、`forwardOut` | 同上；exec 是一次性 channel |
| `RemoteServiceAccess` | `packages/client/src/remoteServiceAccess.ts:76-383` | 把所有服务代理成远端服务 | 要求对端运行完整服务栈 |
| workspace 身份工具 | `packages/shared/src/remote-workspace-identity.ts` | `remote:server:<id>:<path>` 构造/解析 | 需要 `sourceServerId` 来源 |

## 2. 「本地 + SSH」的三种解释与实际含义

| 解释 | 远端要跑什么 | 是否满足「不装 CLI」 | 代价 |
| --- | --- | --- | --- |
| A. 远端跑 Agent，SSH 当通道 | Agent CLI（按需上传/临时运行） | 否，仍要放组件 | 中；丢失断连续跑与 daemon 保活 |
| B. 本地跑 Agent，工具逐条走 SSH | 什么都不用（只要 sshd） | 是 | 极高；重写执行层与四条基础服务 |
| C. 只做远程文件编辑/终端，不做 Agent 任务 | 什么都不用 | 是 | 中；但这不是「远程任务」，是「远程编辑」 |

用户描述的「本地通过 SSH 登录进行操作」最接近 B。B 的核心难点不在连接，而在**Agent 的每一个工具调用都要跨越网络**，且语义要从「进程内」变成「远程 RPC」。

## 3. 方案 B 的完整影响面

### 3.1 Agent 执行层（最硬的部分）

现状：

- Agent CLI 由 Host 以 `cwd = workspacePath` spawn（`zcodeAgentProcessManager.ts:1260-1267`），启动前对 cwd 做 `stat().isDirectory()`（`zcodeAgentSpawnCwd.ts:4-25`）；
- 工具 handler 共 **134 个文件**（`apps/zcode-cli/packages/core/src/tool/handlers/`），Bash / Read / Edit / Write / Grep / Glob / Notebook 等全部在 Agent 进程所在机器执行；
- CLI 内部确有可注入的 `FileSystemPort`（10 个方法，`packages/contracts/src/interfaces/file-system.port.ts:285-324`）与 `ExecutionPort`（`run/start/getBackgroundTask/readBackgroundBashOutput/cancelBackgroundTask/close`，`execution.port.ts:305-318`）；
- 但当前只存在 `NodeFileSystemAdapter` / `NodeExecutionAdapter`，且 Host 侧 spawn 前就要求本地目录存在。

改造 B 需要：

1. 新增 SSH 版 `FileSystemPort`：readdir / stat / realpath / readText / readRange / readBinary / writeText / remove / searchFiles / searchText，全部经 SFTP + 远端 `find`/`rg`；
2. 新增 SSH 版 `ExecutionPort`：长期 shell 会话、cwd 保持、环境快照、PTY、后台任务句柄、进程树终止、输出文件回读；
3. 修改 Agent 启动链：允许 cwd 是远端路径，跳过本地 stat；或把 Agent 改为在本地以「无 cwd」启动、由工具层解析远端路径；
4. 处理平台语义：远端 POSIX 路径、shell、编码、信号、权限、换行；
5. 处理并发：Agent 并行工具调用 → SSH channel 多路复用、限流、取消、背压；
6. 处理断线：连接断开时工具调用的在途状态、后台任务归属、重连后的续接。

风险：不止「慢」。`ExecutionPort.start` 的后台 Bash 语义要求句柄在连接断开后仍可查询；纯 SSH exec 做不到，除非远端常驻一个 helper——又回到「装组件」。

### 3.2 基础服务层

| 服务 | 现状 | 改造 B 需要 |
| --- | --- | --- |
| `IFileService`（`packages/services/src/file/fileService.ts`） | 直接 `node:fs/promises` | 全部方法加远端实现；大文件读写/预览/搜索性能重估 |
| `IFileWatcherService`（`fileWatcher/fileWatcherService.ts`） | `node:fs.watch` | 远端 inotify 长驻进程或轮询；轮询在大仓库不可接受 |
| `ITerminalService`（`terminal/terminalService.ts`） | `node-pty` | `ssh2` shell + PTY + resize + 断线重连；多路会话管理 |
| `IGitService`（`git/repo/gitCliRepo.ts`） | spawn 本机 git | 远端 exec git，解析输出；工作区检测、status、diff、checkpoint 全部改造 |
| 搜索索引（`file/workspaceFileSearch.ts`） | 本地遍历 + 内存索引 | 远端索引或每次 `rg --files`；冷启动成本高 |
| `IPromptAttachmentTransferService` | 本地落盘 + 反向中继 | 双向流式传输；现有 `readFile` 只有整文件 `cat` |

### 3.3 数据与权威

- 现在：任务索引 `~/.zcode/v2/tasks-index.sqlite`、会话 `~/.zcode/cli/db/db.sqlite`、项目库、设置、凭据全部在远端，属于「设备」权威；换一台电脑连接同一设备能看到同一批任务。
- 改造 B：这些库随本地 Host 落到本地。需要决定：
  - 同一远端设备从两台电脑连接，任务历史是否各自独立（会）；
  - 是否需要把本地库同步回远端（成本极高）；
  - 现有 `sourceServerWorkspaceService` 的 canonical key 迁移（`sourceServerWorkspaceAliasRepo.ts`，2,354 行）是否废弃。
- 这是**数据搬家**，不是单纯改代码；已有用户的远端历史数据需要迁移或放弃。

### 3.4 身份模型

- `sourceServerId` 直接来自远端 `install.json.installationId`（`zcode-server-cli/src/runtime/installationOwnership.ts`、`server-core/serverIdentity.ts`）；没有 daemon 就没有这个稳定设备身份。
- `workspaceIdentity` 的 `remote:server:<sourceServerId>:<path>` 与 `remote:ssh:<host>:<port>:<user>:<path>` 是两套语义；后者是 route-derived，R3 已明确它不能作为正式身份。
- 需要重新定义「设备」：按 SSH 目标派生？同一台机器换 IP/端口会变成新设备，与现有「换线路不换设备」的设计冲突。
- 影响面：`SourceServerRecord`、`ConnectionProfile`、`SourceServerWorkspaceHistoryEntry`、状态快照、迁移计数、凭据 key `connection-profile:<id>:*` 全部要改 schema 与迁移。

### 3.5 生命周期

- 删除：Supervisor、单实例锁、崩溃退避、`status.json`、`run/ingress-token`、`stop/restart`、`serve --daemon`、更新与回滚、稳定 launcher。
- 新增：本地 Host 侧的 SSH 连接保活、断线重连、会话恢复；被删掉的是经过 30+ 个已修 issue 打磨过的恢复逻辑。
- 丢失：断连任务继续、后台任务、自动重连后的任务可见性、服务崩溃自愈。

### 3.6 Provider 与配置

- 现在：本机 `ProviderProvisioningSource` 读取本地配置与 allowlist 凭据，经 Host-only 通道单向下发到远端 `IProviderProvisioningTargetService`，远端事务式落地并回滚。
- 改造 B：远端不再有 target；要么「本地 Agent 直接使用本地配置」（那就没有远端配置问题），要么「通过 SSH 写远端 config/credential 文件」（回到文件级远程写）。
- 数据同步（按设备推送 skills/MCP/插件/子智能体/命令/钩子）整套依赖 `source-settings` attachment；改造后需要重做或下线。

### 3.7 UI 与文案

- 向导 5 步 → 3 步：删除「安装 ZCode Server」「启动并检查兼容性」两个阶段（`RemoteConnectionConnectingStep.tsx:45-82`）及安装确认面板（`:461-514`）。
- 设备管理（`SourceServerManagementPanel.tsx`，2,249 行）：删除安装状态、版本、更新、降级、重装、停止/重启、迁移报告、操作日志；保留列表、重命名、移除、首选线路。
- 五态展示模型（`remoteConnectionPresentation.ts:110-231`）缩减：去掉 `needs-install / needs-upgrade / updating / identity-change-pending`。
- i18n：约 200–260 条/语言需要删除或重写（`remote.*` 301、`settings.source.*` 184、`sourceServer.*` 12 中大部分），若数据同步随之下线再增加约 111 条 `remoteSync.*`；新增 SSH 直连文案约 40–80 条。
- 远程任务设备标签、项目来源标识、边界提示、自动恢复展示、后台连接进度均需改写。

### 3.8 测试、发布、文档

| 项 | 规模 |
| --- | --- |
| 远程 E2E | `packages/desktop/test/e2e/conversation-session/remote/` 156 个文件；其中 `installation/` 29 个直接测安装 |
| 远程 helpers / fixtures | 45 个 helper、159 个 fixture 卡 |
| `zcode-server-cli` 测试 | 4 个文件 1,290 行（运行时逻辑几乎没有单测） |
| 发布链 | `packaging/` 8 文件 1,349 行 + `source-server-release.json` + CDN + `bootstrap:with-remote` + CI `build:remote:assets` |
| 文档 | 87 篇提到 source-server，77 篇 remote issue，10 篇 `docs/remote/`，6 篇测试计划 |
| 架构策略 | `architecture-policy.yaml:156-158` 模块条目、upstream snapshot 100 处引用 |

## 4. 规模量化

| 类型 | 量级 | 说明 |
| --- | --- | --- |
| 可直接删除 | `zcode-server-cli` 49 文件 7,836 行；旧链 `connect/deploy/handshake/stdio-socket` 约 2,148 行；`server/src/source-server` 约 990 行；E2E 29–92 个；文案 200–260 条/语言 | 删除不是主要成本 |
| 必须重写 | `sourceServerConnectionManager.ts` 2,001 行、`sourceServerDirectory.ts` 1,527 行、`sourceServerManagementService.ts` 438 行、`sourceServerWorkspaceAliasRepo.ts` 2,354 行、UI 设备管理 2,249 行 | 大部分逻辑仍需要，只是换了底层 |
| 必须新增 | SSH 版 FileSystemPort / ExecutionPort / FileService / Watcher / PTY / Git / 搜索 / 附件流；估算 8,000–15,000 行，且需要长期打磨 | 这是净增量 |
| 净工作量 | **大于**现有实现 | 不是「砍功能」，是「换地基」 |

## 5. 得与失

### 5.1 能得到的

- 免安装：首次连接不需要上传约 90MB，服务器上不留 `~/.zcode/server`。
- 免版本兼容：Agent 与 UI 同版本，不再有 server/desktop 双向兼容门与升级流程。
- 免远端 Node/glibc 约束：只要 sshd 可用即可（前提是本地 Agent 方案）。
- 本地网络与代理直接用于模型请求（当前远端用自己的网络与凭据）。
- 会话/任务数据集中在本地，备份与审计更直观。

### 5.2 会失去的

- **断连任务继续运行**：本地 Host 退出即中断；这是现有远程的核心卖点。
- **多控制端共享同一设备任务**：换电脑连接同一设备不再看到同一批任务。
- **设备身份稳定**：`sourceServerId` 消失，换 IP/端口即新设备。
- **版本兼容治理**：升级 Desktop 即升级 Agent，无法灰度、无法双端协商、无法只升级旧端。
- **远端恢复体系**：Supervisor、崩溃退避、离线探测、更新回滚全部作废。
- **Provider 自动下发与按设备数据同步**：整条链路需重做或下线。
- **性能**：每次 Read/Edit/Grep 增加 RTT；大仓库、批量编辑、文件监听体验显著下降（VS Code Remote 为此专门做了远端 server 与增量协议）。

### 5.3 风险

| 风险 | 说明 |
| --- | --- |
| 后台任务语义 | `ExecutionPort.start` 的句柄在 SSH 断开后不可恢复；要么降级为「尽力而为」，要么远端常驻 helper |
| 文件监听 | 轮询成本高；远端 inotify 需要长驻进程，等于装组件 |
| 并发与取消 | Agent 并行工具调用下的 channel 复用、超时、取消传播 |
| 跨平台路径 | 本地 Windows + 远端 POSIX，路径/大小写/权限/换行语义 |
| 安全 | 本地保存 SSH 凭据；远端命令拼接与注入；0600 token 边界消失后需重新设计鉴权 |
| 数据迁移 | 已有用户的远端任务/会话历史如何保留 |
| 交互延迟 | 连接抖动直接影响每一个工具调用，而不仅是一次 RPC |

## 6. 替代方案（按推荐顺序）

### 方案 1（推荐）：保留 daemon，优化「安装体验」

如果动机是安装摩擦或「服务器要干净」，成本最低的路径是改安装形态而不是改架构：

- 用户级安装（不写 systemd 时自动 detached）、静默安装、安装进度可取消（部分已具备）；
- 企业预装包 / 容器基础镜像 / 包管理器分发；
- 「临时模式」：上传 CLI 后在 SSH 会话内运行，不注册服务、不写入 `install.json`，断开即停（保留协议，牺牲断连续跑）；
- 安装体积优化：只装 agent + runtime，不带全部插件。

### 方案 2（可选）：新增「SSH 轻工作区」形态，与现有远程并存

- 只提供远程文件浏览/编辑、终端、Git 查看，不提供任务/会话/Agent；
- 复用 `IRemoteBackend` + 新增一个轻量 SFTP 文件服务与 SSH PTY；
- 入口与现有「远程设备」区分，不参与 38 个 RPC 频道；
- 好处：满足「零安装」诉求，范围可控；坏处：不是「远程 AI 任务」。

### 方案 3（不推荐直接做）：本地 Agent + SSH 工具代理替换主链

只有在以下条件同时成立时才值得立项：

1. 明确接受丢失断连续跑与多端共享任务；
2. 接受性能下降，并先做基准：10 万文件仓库下 Read/Edit/Grep/终端 的 P50/P95 延迟；
3. 接受 8,000–15,000 行新增执行层与长期维护；
4. 有完整的数据迁移与回滚方案；
5. 先以独立实验分支验证，不删除现有主链。

若做，建议顺序：先实现 FileSystemPort/ExecutionPort 的 SSH 后端 → 单 workspace 只读试点 → 写入与终端 → 后台任务与断线 → 再谈替换。

## 7. 最终判断

- **「远端不装任何组件」与「Agent 全功能」在工程上是矛盾的**：要么远端跑 Agent（装组件），要么每个工具调用跨网络（重写执行层且丢失常驻能力）。现有架构选择了前者，这是行业通行解。
- **改造收益主要是「安装体验」与「版本治理」，成本是执行模型重写 + 产品能力回退**，ROI 为负。
- 如果目标是解决安装摩擦，优先做方案 1；如果目标是提供一种轻量远程编辑能力，做方案 2；不建议用方案 3 替换主链。

## 8. 附：关键文件索引

| 主题 | 文件 |
| --- | --- |
| 连接状态机与安装流程 | `packages/desktop/src/host/sourceServerConnectionManager.ts` |
| 设备/线路持久化 | `packages/desktop/src/host/sourceServerDirectory.ts` |
| 发行包解析 | `packages/desktop/src/host/sourceServerReleaseResolver.ts` |
| RPC 契约与转发 | `packages/desktop/src/host/remoteWorkspaceRpcContract.ts`、`remoteWorkspaceServiceCollection.ts` |
| 传输适配器 | `packages/server/src/source-server/transportAdapter.ts` |
| SSH 原语 | `packages/server/src/remote/ssh-backend.ts`、`backend.ts` |
| 远端 Core | `packages/zcode-server-cli/src/server-core/core.ts`、`http.ts` |
| 服务装配 | `packages/services/src/node.ts:2848-3522` |
| 本地 Agent 启动 | `packages/services/src/zcode-agent/zcodeAgentProcessManager.ts`、`zcodeAgentSpawnCwd.ts` |
| 文件/终端/监听/Git | `packages/services/src/file/fileService.ts`、`terminal/terminalService.ts`、`fileWatcher/fileWatcherService.ts`、`git/repo/gitCliRepo.ts` |
| Agent 工具端口 | `apps/zcode-cli/packages/contracts/src/interfaces/file-system.port.ts`、`execution.port.ts` |
| 架构规格 | `docs/architecture/r3-source-server-remote-architecture.md`、`r2-server-cli-and-daemon.md`、`unified-zcode-lite-server-multi-server-plan.md` |
