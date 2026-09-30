# 多文件夹项目验收记录

日期：2026-10-01。环境：Windows，Node.js 24.14.0。

## 已执行

| 检查                                             | 结果                                  |
| ------------------------------------------------ | ------------------------------------- |
| `pnpm typecheck`                                 | 通过，包含最终整合后的源码            |
| `pnpm lint`                                      | 0 错误、60 条现有警告                 |
| `pnpm architecture:check --changed`              | 通过；baseline 0 / new 0              |
| `pnpm --filter @zcode/web build`                 | 通过；保留现有大 chunk 与动态导入警告 |
| CLI contracts / core / adapters / bootstrap 构建 | 通过                                  |
| UI 核心测试                                      | 11/11 通过                            |
| 运行时核心测试                                   | 4/4 通过                              |
| `git diff --check`                               | 通过                                  |

UI 测试命令：

```powershell
pnpm exec tsx --tsconfig packages/ui/tsconfig.json --test packages/ui/test/workspaceProjects.test.ts packages/ui/test/projectNavigation.test.ts packages/ui/test/projectTaskMembership.test.ts
```

运行时测试与 CLI 构建命令：

```powershell
pnpm exec tsx --test apps/zcode-cli/packages/core/src/runtime/methods/project-workspace.test.ts
pnpm -r --filter @zcode/contracts --filter @zcode/core --filter @zcode/adapters --filter @zcode/bootstrap build
```

变更文件的 `oxfmt --check` 通过，按仓库默认忽略配置检查 69 个文件。

覆盖单目录迁移、主目录切换与旧任务 cwd、关闭后恢复、远程身份隔离、同目录项目的导航归属、旧任务认领边界和项目任务查询。

运行时测试文件：`apps/zcode-cli/packages/core/src/runtime/methods/project-workspace.test.ts`。覆盖多目录 AGENTS 作用域、输入快照持久化与队列提升、目录变化后的 guide 排队，以及独立项目 ID 持久化。

额外对根 Lint 默认忽略的 CLI 路径强制执行检查时，发现 14 个现有 `max-lines` 错误和 8 条现有 spread 警告。未增加禁用规则，也未扩大范围重构这些文件；该补充检查没有通过。

## 交互验收状态

已通过后台浏览器访问现有 `http://localhost:5174` 开发服务，但 Vite 报告无法解析新模块 `@/lib/workspaceProject.js`，页面未能进入可操作状态。源码文件存在，独立 Web 构建能正常解析并通过；旧开发进程缓存是否为原因尚未确认。

此前启动独立验收进程的操作被自动审批拒绝，工具只返回 `blocked by policy`。本轮未重复该启动方式，也未终止现有开发服务。因此以下交互不能记为通过；需要恢复开发服务后执行：

1. 从项目详情打开编辑弹窗，添加第二个目录、改名并保存；验证取消、移除附加目录和重启恢复。
2. 同一会话读取并修改两个目录的文件；执行中编辑目录列表，检查当前轮与下一条消息分别采用旧、新快照。
3. 更换主目录后分别打开旧任务和新任务，检查 cwd、任务归属、项目分区保持正确。
4. 浏览和搜索多个文件根，预览同名文件；切换 Git 仓库，检查状态、分支和操作目标。
5. 手机与远程 Host 实机连接、恢复，检查目录身份及任务归属；本轮没有证明跨窗口配置即时同步。

## 状态所有者与边界

- 窗口 `tabStore` 拥有项目定义；现有 settings 持久化保存活动与已关闭项目快照。
- CLI admission 拥有已接受输入，输入 intent 保存提交时目录快照，原生 session 拥有任务项目归属。
- Desktop continuous 与手机 replayable 继续复用既有 owner/lease、序列和恢复链路；未新增 Host 或客户端接受队列。
- 修改涉及 UI、共享协议、任务索引服务及 CLI 合同、运行时和存储适配器；架构检查未发现新增越界依赖。
- 相对当前 HEAD，源码及测试共 104 个文件，新增 2,821 行、删除 463 行，净增加 2,358 行；不包含 spec 和功能图谱。
