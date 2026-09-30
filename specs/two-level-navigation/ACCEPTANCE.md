# 两层导航验收

状态：关键导航交互已验证；运行环境边界见下文。日期：2026-09-30。

## 隔离环境

- Node 使用 `mise.toml` 指定的 24.14.0；浏览器自动化使用 `agent-browser` 独立会话 `two-level-nav`。
- Web 地址 `http://127.0.0.1:5188`，HTTP/RPC 地址 `http://127.0.0.1:3048`；HTTP 服务由当前源码重新构建，前端由当前源码 Vite 加载。宽屏 1440×1000，窄屏 390×844。
- 临时根目录：`C:/Users/Administrator/AppData/Local/Temp/zcode-two-level-nav-e2e-20260930-7b93`。产品数据通过 `ZCODE_DATA_BASE_DIR` 隔离；不覆盖 `HOME`、`USERPROFILE` 或 `CODEX_HOME`。
- 数据包含两个临时项目、合成历史任务和一条 `enabled=0` 的停用定时任务。测试 provider 指向 `http://127.0.0.1:9/v1`，只使用明确的测试凭据。验收不提交模型请求、不运行定时任务、不安装插件。
- 桌面实例原拟通过独立应用名、用户数据目录、会话目录和调试端口隔离。工具自动审批拒绝了启动 Electron 的动作，仅返回 `blocked by policy`；未使用其他启动方式绕过。后续使用独立 HTTP/Web 环境进行可执行的导航验收。

## 实际结果

| 场景               | 操作与实际结果                                                                                                                                                      | 证据文件                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 一级与二级一致     | 宽屏依次选择项目、定时任务、插件市场；一级选中项、二级栏和正文对应。                                                                                                | `desktop-projects.png`、`desktop-automations.png`、`desktop-plugins-initial.png`               |
| 项目草稿保留       | 输入「两层导航草稿保留验收：只保存，不发送。」，切到定时任务再返回项目，草稿文本完整保留。                                                                          | `desktop-draft-restored.png`                                                                   |
| 任务导航历史       | 打开合成历史任务，后退返回此前定时任务页面，前进重新选中历史任务。只验证导航历史，不验证合成任务的会话恢复。                                                        | 浏览器操作快照；限制见下文                                                                     |
| 定时任务二级列表   | HTTP 服务实际返回停用 fixture，二级栏点击后正文进入编辑详情；修改未保存标题后重复点击一级入口，编辑文本保留；点击二级「定时任务」返回列表，未保存修改没有写入数据。 | `desktop-automations.png`、`desktop-automation-detail.png`、`database-after.json`              |
| 插件分类与详情返回 | 输入搜索后点击「开发者工具」，搜索清空且列表过滤；打开 Gitlab 详情后重复点击一级插件入口仍停留详情；点击面包屑返回仍为开发者工具分类。                              | `desktop-plugin-category.png`、`desktop-plugin-detail.png`、`desktop-plugin-detail-return.png` |
| 插件分段与管理入口 | 个人分段可切换；市场源对话框可打开和关闭；管理已安装进入设置的插件页面，scope 为「用户」。未安装、停用或卸载插件。                                                  | `desktop-manage-installed.png`、`final-accessibility.txt`                                      |
| 宽屏收起           | 二级栏收起后仍显示三个一级入口；点击一级插件入口可切换并重新展开对应二级栏。                                                                                        | `desktop-secondary-collapsed.png`                                                              |
| 窄屏抽屉           | 390×844 下一级栏宽 56px、二级抽屉宽 264px；Escape 和右侧可见遮罩均可关闭，一级入口可重新打开。关闭后 document/body 宽均为 390px，顶部按钮没有与正文重叠。           | `mobile-plugin-drawer-initial.png`、`mobile-plugin-content-settled.png`                        |
| 窄屏列表与任务选择 | 插件正文独立滚动至 scrollTop=690，一级栏保持 x=0/y=0、宽 56px、高 844px；选择 Beta 合成历史任务后标题对应目标，抽屉宽归零。                                         | `mobile-plugin-scrolled.png`、`mobile-task-auto-closed.png`                                    |

主要定位使用现有可访问名称和 `workspace-primary-navigation`、`workspace-primary-projects`、`automations-open`、`plugin-store-sidebar-open`、`workspace-secondary-navigation`。主代理已视觉审阅桌面项目、定时任务、插件分类／详情及窄屏抽屉／正文截图。

初次 fixture 的 Windows 路径分隔符不一致曾产生两个同名 `nav-alpha`；通过临时项目菜单移除重复入口后继续验证，未删除项目文件。`desktop-projects.png` 保留该初始状态，`desktop-draft-restored.png` 为整理后的状态。`mobile-plugin-content.png` 抓到关闭动画中间态，最终视觉依据为 `mobile-plugin-content-settled.png`。

## 环境限制与结果边界

- 纯 HTTP 开发服务没有 Desktop 的 `window-controller` RPC channel，全局任务聚合请求仍报 Unknown channel；未将这部分空列表记为功能通过。定时任务列表与详情通过当前 task service 实际读取成功，不能把该限制泛化为定时任务不可用。
- 合成历史任务只有索引，没有完整会话文件，正文出现 `sessionNotFound`／重新连接。相关操作仅验证选中目标、前进／后退和抽屉自动收起，没有验证真实会话加载或消息恢复。
- 本地测试 endpoint 不提供套餐与运行配置服务，相关刷新错误属于隔离环境限制。该环境未显示闲时任务和工作流入口，因此未实测它们的列表详情链路。
- 浏览器窄屏只验证响应式布局与入口可达，不等同于实际手机连接 Desktop Host 的远程恢复链路。Electron、macOS、Linux 不在本次已执行范围内。
- 主代理此前执行的基线检查已通过，HEAD `9aff046` 与 `origin/dev` 同步。验收子代理独立复核时，`git fetch origin --prune` 因 GitHub 连接重置失败；这是复核失败，不覆盖此前通过的基线结论。
- 数据库终检仍为 4 条合成任务；停用定时任务 `enabled=0`、`run_count=0`、`running=0`，未保存临时编辑标题。没有提交模型请求或运行自动化。
- 截图、浏览器快照、启动脚本与隔离数据库保留在临时根目录。已关闭 `two-level-nav` 会话及本轮服务／浏览器进程，3048、5188、9348 端口均确认关闭。

## 静态与核心测试

主代理使用 Node 24.14.0 执行并报告：

- `pnpm typecheck` 通过；最后补充设置页可见时隐藏抽屉不响应 Escape 的边界后再次通过。
- `pnpm lint` 通过，0 errors / 60 warnings；没有将现存警告写成消失。
- `pnpm architecture:check --changed`：baseline 0 / new 0。
- `pnpm exec tsx --tsconfig packages/ui/tsconfig.json --test packages/ui/test/automationsSecondaryNavigation.test.ts packages/ui/test/pluginStoreNavigation.test.ts`：4 项核心测试通过。
- 格式化本验收文档后，通过对应文件的格式检查。

## 架构治理记录

改动模块为 `ui`（`managed:false`）。源码增 886 行、删 292 行，净增 594 行；统计排除测试、spec 和技能索引。状态所有者及事件顺序见 [SPEC.md](./SPEC.md)，没有协议或服务层行为改动。

## 2026-10-01 分隔线优化复验

复用上述隔离 Web 环境，只验证共享工作区分隔线样式与调宽动作，没有启动 Electron，也没有修改业务数据或运行任务。

- 常态分隔占位与可见 `::after` 均为 1px，颜色 alpha 约 0.051；`::before` 命中区为透明 4px，主面板左边框为 0px，未叠成双线。主代理视觉审阅 `separator-normal.png` 通过。
- 鼠标悬停及拖动时可见线保持 1px，仅颜色加深至 alpha 0.15。以可见线左侧的透明区域起拖，侧栏从 264px 调至 304px，释放后宽度偏好保存为 304。证据：`separator-hover.png`、`separator-dragging.png` 和对应 `separator-*-metrics.txt`。
- 收起二级栏后分隔元素移除，主面板左边框恢复 1px。证据：`separator-collapsed.png`、`separator-collapsed-metrics.txt`。
- 主代理使用 Node 24.14.0 验证：`pnpm typecheck` 通过；`pnpm lint` 为 0 errors / 60 warnings；架构 baseline 0 / new 0。单次 Git 代理配置下的基线检查通过，与 `origin/dev` 同步。
- 本次源码仅 Shell 净增 5 行，没有新增测试文件。验收文档格式检查通过；独立浏览器和 HTTP/Web 进程已关闭，3048、5188、9348 均无监听。

本次结论限于宽屏 Web 中的共享工作区样式及交互，不表示原生 Electron 或其他平台已实测。

## 2026-10-01 三边外框移除复验

复用隔离 Web 环境，在 1440×1000 下只检查主内容外沿、侧栏显隐和右侧面板，不运行任务或打开真实用户项目。

- 主内容 frame 的 top=0、right=1440、bottom=1000；上／右／下间隙、边框与内容外层 padding 均为 0，圆角为 0。左侧导航分隔占位及可见线仍为 1px。`frameless-normal.png` 已由主代理视觉审阅通过，测量记录为 `frameless-normal-metrics.txt`。
- 侧栏开关可收起二级栏，收起后三边仍贴齐且无装饰边框，左边界恢复 1px；点击一级项目入口可重新展开。证据：`frameless-collapsed-metrics.txt`。
- 右侧面板打开后，面板 top=0、right=1440、bottom=1000，上／右／下边框和圆角均为 0；内部左边框 1px 与 4px 拖拽间距保留。证据：`frameless-side-pane.png`、`frameless-side-pane-metrics.txt`。截图中的 `sessionNotFound` 来自没有完整会话文件的合成任务，只作为打开 Header／SidePane 的入口，不计为会话恢复验证。
- 主代理使用 Node 24.14.0 执行 `pnpm typecheck` 通过；`pnpm lint` 为 0 errors / 60 warnings；架构 baseline 0 / new 0；5 个改动文件的格式检查与 `git diff --check` 通过。本验收文档追加后也已格式化并通过格式检查。
- 独立浏览器和本轮 HTTP/Web 进程已关闭，3048、5188、9348 端口均无监听，证据继续保留在原临时目录。

本次未启动 Electron。Windows/Linux 顶栏原 4px 外沿加 1px 边框的偏移补偿及窗口控制安全间距仅做源码检查；原生窗控位置、点击与窗口拖动没有实测。终端内部边界也未扩展浏览器验证。

## 2026-10-01 插件市场管理入口整改

架构范围为 `ui`。当前工作区全部未提交 UI 源码相对 HEAD 增 1867 行、删 1618 行，净增 249 行（含前几轮两层导航改动，含新增文件，排除测试与文档；不是本轮单独增量）。状态所有者和事件顺序见 SPEC。

本轮已实现的产品范围：已安装插件、MCP 服务器、技能移入插件市场二级栏，并在市场正文显示各自管理页；设置移除这三个重复入口，命令与钩子保留。市场浏览页移除已安装图标条，浏览页与当前管理页互斥挂载，管理页沿用原有搜索、作用域和操作能力。

计划执行以下最小 Web 验收，但本轮均未执行，不能据此认定交互通过：

- 依次进入三个管理入口，核对二级栏选中项与正文匹配且不跳转设置；检查搜索、作用域菜单及选中项目作用域后不会回到 User。
- 打开并取消 MCP 新建表单；现有 fixture 提供技能时检查详情。检查公开／个人分段、分类、详情与返回。
- 确认设置中的三个入口消失，命令与钩子仍可访问；在 390px 宽度下通过抽屉进入一个管理页。

准备复用前述隔离 fixture，未安装插件、提交模型请求、运行任务或启动 Electron。启动隔离 HTTP、Vite 与 headless Chrome 的整条 `Start-Process` 命令被自动审批拒绝，仅返回 `blocked by policy`，未提供更具体原因；未重试或通过替代启动方式绕过。拒绝后确认 3048、5188、9348 均无监听，`market-processes.json` 未生成，没有发生部分启动，因此本轮没有新的运行时截图。

Node 24.14.0 执行的工作区基线检查通过：`dev` 与 `origin/dev` 同步，相对 `origin/main` ahead 5 / behind 0。主代理完成的最终静态检查如下：

- `pnpm typecheck` 通过，退出码 0。
- `pnpm lint` 为 0 errors / 60 warnings，本轮新增警告已清理。
- `pnpm architecture:check --changed` 为 baseline 0 / new 0。
- `pnpm exec tsx --tsconfig packages/ui/tsconfig.json --test packages/ui/test/pluginStoreRouting.test.ts packages/ui/test/pluginStoreNavigation.test.ts` 共 3 项通过。

本轮产品源码仅修改 `ui` 模块；作用域与编辑状态由 `PluginsSection` 所有，浏览页与管理页互斥挂载，原 service 语义不变。上述静态检查不替代未执行的浏览器验收。

## 2026-10-01 移除二级菜单类别

- 移除二级菜单「类别」标题和全部分类入口，同时清理浏览页类别选择状态与列表筛选传参；公开市场正文继续按目录分类分组，搜索、个人来源和管理入口保持原行为。
- 改动模块为 ui，三个源码文件净减 72 行；没有新增状态所有者、协议或持久化路径。
- Node 24.14.0 下 typecheck 通过，lint 为 0 errors / 60 warnings，架构 baseline 0 / new 0；现有市场目录与导航测试共 3 项通过，未新增测试矩阵。
- 基线在单次 Git 代理配置下检查通过，与 origin/dev 同步；正文分类保留由现有测试验证。此前隔离服务／浏览器启动已被自动审批拒绝，本轮未重试、未执行界面验收。
