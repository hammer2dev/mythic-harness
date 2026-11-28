# Sidebar Footer Log Export

“导出日志”原先位于左下角账号菜单。当前入口位于桌面工作区和设置页的问号菜单，见 [工作区问号菜单](workspace-header-help-menu.md)。

问号菜单通过 `packages/ui/src/lib/exportLogsAction.ts` 调用与桌面原生菜单共用的主进程导出功能。它打包日志并在系统文件浏览器中显示结果。
