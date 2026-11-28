# Workspace Header Help Menu

桌面工作区和设置页共用问号菜单，提供本地工具和版本信息。

## 布局

- 已有任务的完整 Workspace Header 中，帮助按钮位于 Terminal toggle 左侧，和编辑器切换、Terminal、Side pane 属于同一 header action group。
- 新建任务草稿态没有完整 Workspace Header，但右上角仍提供同一个帮助按钮。
- 按钮使用图标按钮样式，保持 `icon-md` 尺寸和 `ghost` 视觉，避免挤占 workspace 标题。
- Web 工作区与设置页隐藏桌面问号入口。
- Windows / Linux 桌面端的新建任务草稿态右上角有自绘窗口控制按钮，帮助按钮必须通过右侧安全间距避开最小化、最大化和关闭区域。

## 菜单项

菜单从上到下为导出日志、复制设备 MID、资源管理器、预装工具、检查更新和关于 ZCode。检查更新仅 production 显示，沿用动态文案和禁用状态。产品文档、用户社群、通用问题上报、提交漏洞和产品需求已下线。会话与错误入口可打开带上下文的诊断反馈。

「导出日志」复用 `titleBar.menu.help.exportLogs` 文案和 `runExportLogsAction()`，经 `IPlatformService.exportLogs()` 调用系统菜单使用的同一个主进程导出函数。沿用导出提示、错误反馈和文件定位。

“复制设备 MID”仅在桌面端显示。它复用 renderer 已注入的稳定 device MID，不读取 telemetry 文件、不新增 IPC，也不区分 macOS、Windows 和 Linux 的实现路径。

```text
问号菜单 → 共享导出动作 / toast → IPlatformService.exportLogs() → IPC ─┐
系统菜单 → DesktopCommandIds.ExportLogs ────────────────────────────┤
                                                                  ↓
                                                    main exportLogs → 日志包 / 系统定位
```

更新状态链路：main updater（唯一 owner）→ 平台快照 / 状态事件 → 菜单展示；点击 → 现有桌面命令 → main updater。实时事件优先于较早发出的快照，卸载后不应用响应。

验收：桌面任务页、草稿态和设置页的共享问号菜单均可打开关于窗口，中英文显示“关于 ZCode” / “About ZCode”；Web 不出现无效入口。

桌面 E2E `help-menu-about.test.ts` 在英文草稿态与中文设置页点击导出日志，验证主进程生成 ZIP、请求系统定位并关闭导出提示，同时核对菜单顺序和关于入口。用例拦截系统定位调用，实际生成归档。

桌面 E2E `help-client-config.test.ts` 点击英文“Copy device MID”，从 Electron 系统剪贴板读取并核对当前 renderer 注入的 device MID。

2026-10-09 验证：macOS arm64 Preview E2E 4/4 通过，英文 Zai Light、中文 Zai Dark 截图已核对；帮助配置使用本地夹具，等待动态项加载结束后断言顺序。相关单测 34/34、typecheck、E2E typecheck、lint、架构及格式检查通过；lint 有 68 条非本次改动警告。未运行 Windows/Linux 实机、手机浏览器及 production 身份 E2E。运行记录：`packages/desktop/.e2e-artifacts/desktop-e2e-20261009043852849-p29715-f22a05c87493b116/summary.json`。

所有可见文案必须走 i18n；菜单项使用 lucide 图标，不硬编码中文到组件内。
