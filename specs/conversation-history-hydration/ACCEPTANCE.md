# 历史恢复修复验证

## 回归结果

- 修复前，两条回归均失败：带项目快照的历史由正常 5 行减少为 2 行；共享上下文更新后没有恢复助手正文。
- 修复后，两条回归均通过。项目归属、正文、思考、工具内容及完成状态与逐事件恢复一致；Desktop continuous 与 Web replayable 均收到完整快照。
- 受影响会话只读复验：批量恢复完整 23 行（7 条助手正文、7 条思考、6 个工具调用、1 条用户消息、2 个轮次标题），助手流事件拒收计数为 0。没有修改历史数据库或输出真实正文。

## 执行检查

| 检查                                                                                                                | 结果                                                                                |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `pnpm exec tsx --test apps/zcode-cli/packages/bootstrap/src/zcode-protocol-v4/conversation-topic-publisher.test.ts` | 2 条通过                                                                            |
| `pnpm typecheck`                                                                                                    | 通过                                                                                |
| `pnpm --dir apps/zcode-cli typecheck`                                                                               | 通过；27 个任务成功                                                                 |
| `pnpm lint`                                                                                                         | 0 错误、60 条既有警告                                                               |
| `pnpm --dir apps/zcode-cli lint`                                                                                    | 未通过：多个既有文件超过 400 行限制；修改的投影文件仍有同一既有错误，新增测试无诊断 |
| `pnpm architecture:check --changed`                                                                                 | baseline 0 / new 0                                                                  |
| 修改文件格式检查与 `git diff --check`                                                                               | 通过                                                                                |
| `pnpm --dir apps/zcode-cli --filter @zcode/cli build:desktop-agent`                                                 | 通过，已重建桌面 Agent 包                                                           |

CLI 检查首次因 PATH 中没有 `turbo` 无法执行；加入仓库根目录现有工具后重跑。未安装或恢复依赖。

## 未验证范围

没有执行实际桌面窗口的重启显示 E2E。已验证完整持久化内容经批量恢复和两种订阅输出的结果；更新后的 Agent 需要重新启动应用才能被当前进程加载。

本次生产代码改动仅删除 reducer 内两处重复快照赋值并补充原因注释，状态所有者和接口没有改变。
