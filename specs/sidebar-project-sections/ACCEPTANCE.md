# 项目分区实机验收

日期：2026-09-30。

## 隔离环境

- Windows，浏览器测试服务使用已安装 Node 24.19.0；最终静态检查与核心测试使用 `mise.toml` 指定的 Node 24.14.0。Chrome、agent-browser 0.38.1，独立命名会话 `sections-e2e`。
- Web `http://127.0.0.1:5187`，HTTP/RPC 服务 `http://127.0.0.1:3047`；使用当前源码构建。
- 临时根目录 `C:/Users/Administrator/AppData/Local/Temp/zcode-sections-e2e-ee5ce984`。独立 HOME、USERPROFILE、应用配置和数据目录、浏览器 profile；不读取或改写真实用户配置。
- 测试 provider 使用本机无服务端口 `http://127.0.0.1:9/v1` 与明确的测试凭据。只提交一次草稿验证真实会话创建，没有调用真实模型。
- 两个临时项目 `section-alpha` / `section-beta`、一个独立会话 workspace；隔离 SQLite 预置旧版 task group 成员与历史任务，用于实际启动迁移后检查。

## 实际结果

| 场景                     | 实际结果                                                                                                                                                                | 证据文件                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 项目新建分区             | 项目更多菜单 → 分区 → 新建分区，保存后 `section-alpha` 自动归入「公司项目」，历史组内任务仍显示在项目下                                                                 | `section-created-with-legacy-task.png`                                                                                 |
| 重命名、折叠、排序与恢复 | 改名「工作项目」，折叠并拖到「任务」之后，刷新后名称、位置、折叠和项目归属全部保持                                                                                      | `section-order-collapse-refresh.png`                                                                                   |
| 旧分组偏好               | 显式写入 `organizeBy=grouped` 后刷新，进入项目视图，持久化值改为 `project`，旧分组/项目切换不再显示                                                                     | `section-order-collapse-refresh.png`、浏览器存储读取                                                                   |
| 右键与默认归属           | 项目右键 → 分区显示当前归属勾选；选择「项目」后返回默认区；可再选择已有分区                                                                                             | `project-context-section-checked.png`                                                                                  |
| 删除分区                 | 把项目再次归入「工作项目」后删除该分区，`section-alpha` 和历史任务返回默认项目区，内容保留                                                                              | `section-deleted-project-retained.png`                                                                                 |
| 数据库升级               | 当前服务实际启动应用 `0004_retire_task_groups`，四张组专用表消失，三个预置任务仍未删除、未归档，workspace 保持原值                                                      | `database-before.json`、`database-after.json`                                                                          |
| 新建与草稿               | 项目行新建进入该项目草稿；「任务」区新建进入独立草稿；两者可输入，项目草稿跨切换仍恢复                                                                                  | `project-new-task-draft.png`、`conversation-new-task-draft.png`                                                        |
| 首次提交                 | 在临时 `section-alpha` 提交一次草稿，真实会话 `sess_8702f408-b7b5-47b3-a60d-9b70042b18c8` 出现在项目列表并落入 SQLite；本机模型连接重试期间点击停止，界面变为「已停止」 | `database-after-first-submit.json`、`final-desktop-first-submit-toolbar-right.png`                                     |
| 窄屏按钮与菜单           | 390×844、触摸媒体查询为 coarse，完整刷新后使用可见「切换侧边栏」按钮关闭/打开；直接点击项目更多 → 分区创建「手机工作」，自动归入，再从分区菜单改名「手机验收」          | `mobile-sidebar-toggle-fixed.png`、`mobile-project-section-menu-fixed.png`、`mobile-section-renamed-toolbar-right.png` |
| 工具栏对齐               | 全部展开/收起、筛选排序、归档三个按钮组成同一行并靠右；桌面和窄屏截图可见                                                                                               | `final-desktop-first-submit-toolbar-right.png`、`mobile-section-renamed-toolbar-right.png`                             |

证据保留在上述临时根目录，未提交截图或测试数据库到仓库。主要截图：[桌面最终状态](C:/Users/Administrator/AppData/Local/Temp/zcode-sections-e2e-ee5ce984/final-desktop-first-submit-toolbar-right.png)、[窄屏分区与工具栏](C:/Users/Administrator/AppData/Local/Temp/zcode-sections-e2e-ee5ce984/mobile-section-renamed-toolbar-right.png)、[删除分区后保留项目](C:/Users/Administrator/AppData/Local/Temp/zcode-sections-e2e-ee5ce984/section-deleted-project-retained.png)。

验收中发现普通 Web 窄屏收起侧栏后没有可点击恢复入口，原因是既有顶栏开关只在桌面平台显示。本轮复用已有开关补齐 Web 入口后，已按上表复验；不依靠键盘快捷键完成最终窄屏入口验证。

## 代码验证

主代理在 Node 24.14.0 执行最终整合检查：`pnpm typecheck` 退出码 0；`pnpm lint` 退出码 0、0 errors / 61 warnings；`pnpm architecture:check --changed` 为 0 violations；8 项核心测试通过。工具栏最终右对齐修改后静态检查再次通过。Lint 现存警告未记为消失。

## 范围说明

- 本轮窄屏验收针对 Web 响应式布局和触摸媒体查询仿真，不等同于实际手机连接 Desktop Host 的远程恢复链路验收；Electron、macOS/Linux 未实测。
- 隔离 HTTP 开发服务缺少 `window-controller` RPC channel，`useGlobalTaskList` 的 timeline / pinned 请求报 `Unknown channel: Channel name 'window-controller' timed out after 1000ms`。因此独立会话与置顶聚合列表的 UI 恢复未验；独立会话预置数据仍在 SQLite，项目自身列表中的历史组内任务已实际显示。不能把该结果表述为全部旧任务列表已通过实机验收。
- 首次提交验证了真实会话创建、列表显示和落库。测试 endpoint 没有模型服务，观察到连接重试后主动停止，未验证模型生成成功；没有扩展或安装 runtime。
- 远程同路径项目身份隔离由核心状态测试覆盖，未建立真实远程 Host 连接；自动化入口保留可见，未触发真实自动化任务。
- 初次启动曾遇到其他并行修改中的 onboarding 缺失 import，随后由该工作更新消失，没有为测试替换产品组件。
- 验收结束后关闭专用浏览器会话、HTTP/Web 服务、触摸仿真辅助进程及其子进程，保留临时证据文件。
