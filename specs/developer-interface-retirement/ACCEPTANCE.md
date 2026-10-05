# 开发者界面收敛：实测验收

日期：2026-09-30。

本文件记录办公模式与 CUA 移除阶段的实测结果。首次引导随后收敛为单页助手偏好，当前引导验收见 [助手偏好验收](../onboarding-preferences/ACCEPTANCE.md)。

## 环境

- Windows、本地 Web 开发服务器、Chrome，通过 agent-browser 执行真实 UI 交互。
- 使用独立临时 HOME、USERPROFILE、ZCODE_DESKTOP_HOME_DIR、ZCODE_DATA_BASE_DIR 和测试 workspace；没有读写用户现有设置。
- 使用仅指向本机测试地址的模型配置，不提交模型任务，不访问真实模型凭据。
- 视口：1280 × 720、390 × 844。
- 本次 Web 进程使用已安装的 Node 24.19.0；仓库要求的 Node 24.14.0 静态检查由主任务执行。

## 已通过

| 场景                | 实际结果                                                                                                                                                    | 截图文件名                                                                               |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 新用户引导          | 工作方向后直接进入助手偏好，仅两步；主动任务推荐默认未勾选                                                                                                  | onboarding-preferences.png                                                               |
| 独立主动建议开关    | 常规设置中默认关闭；开启后 UI 和隔离 setting.json 的 proactiveSuggestionsEnabled 均为 true，重开页面后显示开发建议；恢复关闭后刷新，UI 与持久化值均为 false | general-default-off.png、main-suggestions-on.png、general-restored-off-legacy-office.png |
| 旧办公模式偏好      | 写入 zcode-interface-mode=office 后刷新，仍进入统一界面，无办公/编程界面模式设置或提示                                                                      | review-legacy-office.png                                                                 |
| 侧边栏菜单          | 账户菜单不再显示语言、主题、缩放和统计快捷入口；这些功能仍可从设置页访问，并保留升级、连接等账户操作；无办公/编程模式入口                                   | sidebar-menu-no-mode.png                                                                 |
| 终端与审查入口      | 旧 office 值仍存在时，命令面板能打开终端与审查；真实终端面板显示 workspace 标签和 Terminal input，审查面板显示“未暂存”与刷新按钮                            | terminal-legacy-office.png、review-legacy-office.png                                     |
| 不可用 CUA 产品入口 | 输入框没有 v4-composer-cua-entry；设置导航及插件管理无电脑控制入口、不可用内置能力卡片                                                                      | review-legacy-office.png（插件管理以 AX 快照与 DOM 检查为证据）                          |
| 浏览器能力保留      | 浏览器控制设置及已启用的浏览器操作插件可见；Web 的浏览器数据管理操作仍按平台能力禁用                                                                        | browser-control-web.png（插件管理以 AX 快照与 DOM 检查为证据）                           |
| 窄屏                | 390 × 844 的主界面输入框与操作区可用，无 CUA 入口                                                                                                           | mobile-main.png                                                                          |

截图保存在 C:/Users/Administrator/AppData/Local/Temp/zcode-retirement-e2e-KFXkha，未提交到仓库。主动建议开关控制开发任务列表；关闭后现有场景 chips 仍可见，本轮没有将其记为主动建议列表。

关键截图：[引导默认关闭](C:/Users/Administrator/AppData/Local/Temp/zcode-retirement-e2e-KFXkha/onboarding-preferences.png)、[常规设置默认关闭](C:/Users/Administrator/AppData/Local/Temp/zcode-retirement-e2e-KFXkha/general-default-off.png)、[开启后的开发建议](C:/Users/Administrator/AppData/Local/Temp/zcode-retirement-e2e-KFXkha/main-suggestions-on.png)、[旧办公偏好下终端与审查](C:/Users/Administrator/AppData/Local/Temp/zcode-retirement-e2e-KFXkha/review-legacy-office.png)、[窄屏](C:/Users/Administrator/AppData/Local/Temp/zcode-retirement-e2e-KFXkha/mobile-main.png)。

## 复跑步骤

1. 创建独立临时目录及 workspace，为服务端子进程同时设置上述数据隔离变量；使用规范化的 Windows 完整路径，避免短路径 HOME 引起 Node fs-event 断言。
2. 通过 server 的 tsup 构建产物启动 HTTP 服务，启动 Web Vite；Windows 上直接传递 tsup 的 onSuccess 参数，绕过现有 package.json 单引号命令问题，不修改开发脚本。
3. 使用隔离的 Chrome profile 访问本地 Web；建立本机地址的测试模型配置，避免登录或真实模型调用。
4. 直接进入助手偏好，检查主动建议默认关闭；在常规设置开启、关闭，并通过页面刷新与隔离持久化文件核对结果。
5. 写入旧 localStorage office 偏好并刷新；检查设置、侧边栏菜单、输入框及插件管理。
6. 选择测试 workspace，使用命令面板打开终端及审查；再将视口切换为 390 × 844，检查窄屏布局。
7. 关闭测试浏览器、服务端、Web 和测试 runtime 子进程。

## 未实测范围与限制

- 未启动 Electron；原生编辑器打开、macOS/Linux 权限行为未实测。
- 窄屏仅验证本地 Web 响应式界面，未连接真实手机或桌面 Host attachment，未将其记为远程 replayable 链路通过。
- 未发送真实模型任务，未执行浏览器自动化动作；历史 CUA transcript 渲染本轮保留原实现，未构造历史会话 UI 验收。
- 审查验证到面板与入口可用；测试 workspace 没有 Git 变更，未验证 diff 内容。
- 临时 runtime 缓存中的 Node Repl Host 描述曾包含 Computer Use；当前仓库 manifest 已由主任务修正，本轮未重装整套 runtime 缓存。
- agent-browser 在此 Windows 环境的 open/reload 偶发返回 EOF 或 about:blank；使用新快照确认页面、通过页面 reload 恢复后才记录通过。统一浏览器工具连接失败且 IAB 不可用。
