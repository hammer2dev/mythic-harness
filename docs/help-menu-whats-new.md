# Help Menu What's New

- Desktop 帮助菜单新增 `What's New` / `更新日志` 入口。
- 链接由主进程按当前应用语言统一分流：`zh-CN` 打开 `https://zcode.z.ai/cn/changelog`，其他语言打开 `https://zcode.z.ai/en/changelog`。
- 菜单文案走 `packages/shared/src/desktopMenu.ts`，点击行为走 `DesktopCommandIds.OpenChangelog -> desktopCommandHandlers.openChangelog`，避免 URL 规则散落在菜单模板里。

## Workspace / Settings 问号菜单

- Workspace header、新建任务 header 和 Settings 页面共享同一个问号菜单组件。
- 桌面问号菜单提供导出日志、复制设备 MID、资源管理器、预装工具、检查更新和关于。Web 隐藏该入口。
- 桌面问号菜单通过 `IPlatformService.exportLogs()` 导出日志并显示统一状态提示。
- Settings 页面把问号入口放在右侧内容面板顶部，并复用 new task 的窗口按钮避让偏移，避免和 Windows / Linux 自绘窗口控制按钮发生点击区域冲突。
