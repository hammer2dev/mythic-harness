# 项目置顶验收记录

日期：2026-10-01。环境：Windows，Node.js 24.14.0。

## 已执行

- `pnpm typecheck` 通过。
- `pnpm lint`：0 错误、60 条现有警告。
- `pnpm architecture:check --changed`：baseline 0 / new 0。
- 变更文件格式检查与 `git diff --check` 通过。
- `pnpm --filter @zcode/web build` 通过；现有构建警告保留。
- `pnpm exec tsx --tsconfig packages/ui/tsconfig.json --test packages/ui/test/sidebarSections.test.ts packages/ui/test/projectNavigation.test.ts`：8/8 通过。

本次新增 2 个核心测试，覆盖旧偏好兼容、置顶幂等与恢复、置顶期间移动或删除原分区，以及取消后的归属。复用 3 个导航测试检查稳定项目身份与分页行为。

## 实机交互限制

后台浏览器访问现有 `http://localhost:5174`，该端口实际提供 Desktop renderer，需要 Electron 的预加载注入。普通浏览器报错 `Cannot read properties of undefined (reading 'printPageToPdf')`，没有进入应用操作界面。

当前自动化可用界面未包含 Electron 原生窗口；现有应用的调试端口也不在可用浏览器控制接口中。本轮未重启应用或注入虚构平台接口，完整 E2E 不能记为通过。

待实机执行的关键场景：

1. 在自定义分区的项目更多菜单点击「置顶项目」，确认项目只出现在「已置顶」区域，且任务与项目共用一个区域标题。
2. 折叠原分区，展开置顶项目并使用「显示更多」；切换时间线和归档视图后仍能访问项目及已展开任务。
3. 刷新后检查置顶状态；通过右键「取消置顶项目」确认返回原分区。置顶期间移动或删除原分区，再取消时检查最新归属。
4. 拖拽多个置顶项目，检查项目排序；改名或切换主目录后检查置顶状态仍在。

## 状态与边界

改动仅由 UI 模块拥有：`sidebarSectionsStore` 负责本端置顶偏好，`tabStore` 保持项目定义及排序所有权，侧栏只派生展示。原分区映射保留，置顶不调用任务服务，也不改变 Agent、Host 或流式协议。

源码及测试共修改 8 个文件，新增 215 行、删除 95 行，净增加 120 行；列表渲染逻辑提取复用，未引入第二套项目列表状态。
