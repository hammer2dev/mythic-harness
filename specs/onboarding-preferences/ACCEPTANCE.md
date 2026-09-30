# 直接进入助手偏好：Web 实测记录

日期：2026-09-30。本文区分已完成实测与工作区变化后的未完成复验，不将此前结果视为最终工作区整体通过。

## 环境与隔离

- Windows、Chrome、agent-browser、本地 Web，视口 1280 × 720。
- 使用仓库要求的 Node 24.14.0，运行服务端已有 HTTP 构建产物及 Web Vite；本轮服务端和共享记录 schema 没有改动。
- 独立 fixture：`C:/Users/Administrator/AppData/Local/Temp/zcode-preferences-e2e-CMl7Q2`，包含测试 workspace、浏览器 profile、设置、记录、日志和截图；保留目录供后续复验。
- 仅向测试子进程注入 `ZCODE_DESKTOP_HOME_DIR`、`ZCODE_DATA_BASE_DIR`、`ZCODE_SERVER_WORKSPACE` 等任务专用变量，没有设置或复用 HOME、home、USERPROFILE、CODEX_HOME 作为测试数据目录。
- 模型配置使用先前测试的 dummy loopback fixture；登录界面选择“使用 API key → 暂时跳过”，没有登录真实账号、发送模型任务或执行迁移。

## 工作区回写前已通过

| 场景           | 实测结果                                                                                                                                                     | 证据                                                                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新用户首次引导 | 跳过登录后直接出现助手偏好：主动推荐、工作区记忆、迁移三项；均默认未勾选；没有职业选项、下一步、返回或两步进度                                               | [偏好页](C:/Users/Administrator/AppData/Local/Temp/zcode-preferences-e2e-CMl7Q2/new-direct-preferences.png)及 AX 快照                                                                                                     |
| 保存及刷新     | 开启记忆、保持建议关闭，点击“开始使用”；现场读取 settings 为 `other/true/false`，完成记录为 `occupation:null`、记忆 true、建议 false；刷新进入主界面，不重弹 | [刷新后主界面](C:/Users/Administrator/AppData/Local/Temp/zcode-preferences-e2e-CMl7Q2/saved-reloaded-main.png)及持久化文件现场读取                                                                                        |
| 设置手动打开   | 常规设置“打开引导”直接进入偏好；记忆 true、建议 false、迁移 false，预填正确；Esc 退出没有更改偏好                                                            | [手动重开](C:/Users/Administrator/AppData/Local/Temp/zcode-preferences-e2e-CMl7Q2/manual-reopen-prefilled.png)及 AX 快照                                                                                                  |
| 旧完成记录     | 在隔离目录种入旧 `office/true/true` 完成记录及相同设置，刷新不自动引导；Ctrl+Shift+O 重开直接偏好，记忆和建议 true、迁移 false                               | [旧记录重开](C:/Users/Administrator/AppData/Local/Temp/zcode-preferences-e2e-CMl7Q2/old-completed-reopen.png)、[种入数据](C:/Users/Administrator/AppData/Local/Temp/zcode-preferences-e2e-CMl7Q2/old-completed-seed.json) |
| 跳过保留设置   | 上述旧记录重开后将记忆、建议草稿均改为 false，再点击“跳过”；settings 仍为 `office/true/true`；记录保留 office，两个被跳过的偏好写为 null                     | [跳过后持久化结果](C:/Users/Administrator/AppData/Local/Temp/zcode-preferences-e2e-CMl7Q2/old-completed-after-skip.json)及主界面 AX 快照                                                                                  |

上述截图均已实际查看，未使用空白或加载画面作为通过证据。关闭主动推荐后仍可见已有场景 chips，该行为不属于本轮调整范围。

## 回写及重新应用后的证据

- 18:26（Asia/Shanghai）左右，当前 `OccupationOnboarding.tsx` 再次出现职业列表及 `OnboardingOccupationGrid` 导入，后者已删除；Vite 报无法解析导入。测试代理没有编辑或恢复源码。
- 主任务保留回写版本后，重新应用已确认的单页改动。18:30 后读取该文件的 SHA-256 为 `904850d1f62478121ffd867ef7229e3b9617df1313d2313e7e7c46cefe0f7171`。
- 此后另有工作区分组相关文件变化，Web 无法加载。停止旧 Vite 并用 `--force` 重启仍得到六项依赖加载失败，已排除仅为旧 HMR 图导致的错误。
- 因此，重新应用后的单页 UI、保存或跳过再刷新尚未完成复验；之前通过的交互只对应回写前已运行的单页实现。

## 当前 Web 阻断点

Vite 提示以下源码引用目标缺失，均不属于本轮引导改动；没有恢复这些删除文件：

- `WorkspaceSidebar.tsx` 引用 `WorkspaceGroupedTasksSection.js`、`workspace-grouped-tasks/sticky-group-header-slot.js`、`lib/groupedTaskExpansionPreference.js`、`WorkspaceSidebar/taskGroupTogglePresentation.js`。
- `workspace-grouped-tasks/shared.tsx`、`workspace-grouped-tasks/task-row-action-button.tsx` 仍被相关组件引用。

原始启动与 HMR 日志位于 fixture 的 `web.log`；最后一次强制重启的错误见本轮工具输出。

## 剩余未验收

- 旧关闭记录不自动重弹、手动重开预填；已种入 [旧关闭记录 fixture](C:/Users/Administrator/AppData/Local/Temp/zcode-preferences-e2e-CMl7Q2/old-dismissed-seed.json)，页面加载受阻，尚未记为通过。
- 英文与一例窄屏 Web 偏好页面；尚未执行，不能沿用前一轮其他功能的窄屏结果。
- 工作区稳定后的最终单页渲染、保存或跳过及刷新复验。
- Electron、真实手机 Host attachment、登录换号、实际会话迁移与模型调用没有实测。

## 继续验收

待主任务确认当前工作区稳定后，以 fixture 内 `launcher.mjs` 启动隔离服务端及 Web，并使用同一独立浏览器 profile。先确认页面成功加载，再验证旧关闭记录、手动预填及跳过保留设置，切换英文，检查一例窄屏，最后复验保存或跳过后刷新。不要恢复与任务无关的已删模块，不扩大平台或偏好组合矩阵。

本轮服务端、Web、runtime 子进程、浏览器及保持浏览器的终端已关闭；复查 3030/5173 没有监听，本轮 preferences 浏览器 session 不再活跃。其他任务的浏览器 session 未处理，fixture 与截图保留。
