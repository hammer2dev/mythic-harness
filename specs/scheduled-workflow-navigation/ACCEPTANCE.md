# 定时任务与工作流拆分验收

日期：2026-10-01。环境：Windows、Node.js 24.14.0。

## 已执行

- 根目录 `pnpm typecheck` 通过。
- 根目录 `pnpm lint`：0 错误，60 条原有警告。
- `pnpm architecture:check --changed`：baseline 0 / new 0。
- `pnpm --filter @zcode/web build` 通过；保留既有的大 chunk、无效动态导入及插件耗时警告。
- 修改文件格式检查、`git diff --check` 通过。
- 功能图谱 YAML 解析、唯一 ID、关系端点与 rank、源码路径及符号检查通过：47 个节点，63 条关系。
- 关键测试 6/6 通过：

```powershell
pnpm exec tsx --tsconfig packages/ui/tsconfig.json --test packages/ui/test/workflowNavigation.test.ts packages/ui/test/savedWorkflowNavigation.test.ts
```

测试覆盖独立导航历史、旧 workflow 入口映射及去重、前进／后退的远程身份、删除聊天历史与前进栈截断，以及全局／项目同名流程选择隔离和返回概览。它们属于逻辑测试，不能替代实机交互验收。

## 实机交互限制

本轮可用界面自动化环境的应用列表为空，没有可控制的 Electron 窗口。此前确认的 `localhost:5174` 是 Desktop renderer，需要 Electron preload；普通浏览器缺少平台注入，无法进入实际工作区。未启动替代验收进程或注入虚构平台接口，因此本轮 E2E 未执行，不记为通过。

以下保留为关键 E2E 场景：

1. 在动态工作流快照 enabled=true 且已有停用定时任务的环境，依次点击项目、定时任务、工作流、插件市场。确认一级选中、二级列表和右侧标题一致；定时任务栏只显示定时／闲时任务，重复点击不重置当前详情。
2. 全局与两个项目分别已有工作流时，在二级目录选择流程并切换到同名的另一项目或全局流程。确认目录持续可达，详情的范围、参数、草稿及历史随选择更新；返回全部工作流恢复概览，关闭当前详情所属项目回到概览。
3. 定时任务详情、闲时任务详情与工作流入口交替访问后前进／后退，确认落在正确一级入口并保留 workspace identity；工作流创建／修订只预填对应项目的聊天草稿。运行、删除与产物入口继续走原服务，验收不运行真实生产任务。
4. 在宽屏验证二级目录滚动和原分隔线，在 390px Web 验证抽屉展开、选择、遮罩／Escape 关闭；验证工作流开关关闭时入口隐藏并回退定时任务。载入错误、无效流程、未连接项目和空库存不能混成同一空态。

## 所有者与变更范围

App 拥有一级视图，zcodeSessionStore 拥有跨模块导航历史，SavedWorkflowsSection 拥有工作流选择。目录派生自 savedWorkflowStore，各 Group 保留一份查询、监听和操作；没有新增库存缓存或写入路径。Host、调度器、Agent 协议及远程恢复语义保持原规则。

源代码和关键测试共涉及 25 个文件，新增 746 行、删除 493 行，净增 253 行；文档与图谱另计。旧标题切换器、sessionStorage 标签记忆和对应无引用 test ID 已移除。
