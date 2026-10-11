# ToolSearch / ApplyPatch 实现验证

日期：2026-10-11。范围仅为两个基础工具；LSP、AST、Dependency Graph 和软件开发插件仍为待定设计。

## 自动化结果

35 项测试通过，0 失败、0 跳过。测试使用真实 AgentRuntime、NodeFileSystemAdapter 临时目录及 SQLite 会话存储；模型使用可控脚本响应，MCP 使用测试 descriptor/handler，不调用外部服务。

| 行为       | 已验证证据                                                                                                                                                   |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 搜索与请求 | 首请求仅常驻；ToolSearch 后下一请求带 ApplyPatch 完整 schema，并实际创建文件；结果不重复携带 schema。                                                        |
| 权限与预算 | 内置/MCP 搜索、受限子代理不扩权、取消不激活、移除不复活；估算总预算、常驻超限、跨轮 LRU、同批已调用工具保护。                                                |
| 会话历史   | compact 不带工具；SQLite 冷恢复、真实 fork 边界及 conversation rewind 正确恢复激活状态。                                                                     |
| 配置       | 默认 16,000/5，用户与项目按字段合并、非法值拒绝、runtime 覆盖优先；结果上限可调。                                                                            |
| 补丁提交   | 四种操作、多 hunk、全量预检阻断、严格唯一匹配、移动部分完成、后续条目停止、排他创建竞争、revision hash 冲突。                                                |
| 取消与失败 | 提交后取消仍返回已落盘项；后置 hook 异常不擦除事实；未知 I/O 明确未确认；被修改输入重新检查目标权限。                                                        |
| 文件边界   | NUL 拒绝、符号链接预检与提交复检；沿用现有文本编码/主换行策略。                                                                                              |
| 恢复与展示 | 部分提交 checkpoint、artifact 失败仍有 turn changes；删除的 null 后态、并发重建冲突；GBK + CRLF rewind 与失败补偿；冷恢复 read-state 不重复写盘。            |
| 双链路投影 | partial/error 多文件 diff 经真实 V4 ProductProjection、冷 transcript hydration、continuous/replayable snapshot 均保留；先改后删的 live/cold/query 摘要一致。 |

以上为删除测试源码前的历史验证结果。15 个临时测试文件已按用户 2026-10-11 的要求删除，原测试命令不再是当前可执行入口；后续需要复验时编写临时核心用例，执行完成后删除，不随代码提交。

## 测试源码清理复核（2026-10-11）

已删除全仓 39 个 `.test.ts` 文件（含上述 15 个文件），源码目录复扫无剩余；`.gitignore` 对根包与 CLI 内的同后缀路径均生效。根与 CLI `typecheck` 通过，CLI 为 27/27 tasks；根 `lint` 通过，仍有 17 条既有警告。CLI `lint` 仍被既有 `max-lines` 错误阻塞，本次未修改生产源码。架构检查通过，0 baseline、0 new violations；`git diff --check` 通过。本次只清理验证源码和引用，未重新执行已删除的行为测试。

## 静态检查

| 命令                                  | 结果                                                                                                                                    |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                      | 通过。                                                                                                                                  |
| `pnpm lint`                           | 通过，17 条已有警告、0 错误。                                                                                                           |
| `pnpm --dir apps/zcode-cli typecheck` | 通过，Turbo 27/27 tasks 成功。                                                                                                          |
| `pnpm --dir apps/zcode-cli lint`      | 未通过；现有文件超 400 有效行的规则阻断。core/adapters/bootstrap/contracts 的错误文件在 HEAD 基线也已超过限制；没有修改基线或关闭规则。 |
| `pnpm architecture:check --changed`   | 通过，0 baseline、0 new violations。                                                                                                    |

CLI 子目录缺少本地 Turbo shim，本次运行聚合检查前，仅在命令进程内把仓库根 `node_modules/.bin` 加入 PATH；没有修改依赖或全局环境。使用 Node 24.19.0，仓库固定 24.14.0，命令报告版本警告；Turbo 也报告部分工作区未出现在 lockfile 的警告。上述类型检查仍真实成功。

## 估算与验收边界

当前 39 个 provider-visible 内置工具的 SDK 定义约 23,922 个估算 token；15 个常驻约 8,288，初始定义估算减少 65.4%。Anthropic strict 转换路径分别为 24,732/8,602。该盘点未做具体会话资格裁剪，不含 MCP，非 provider tokenizer 或计费数据；详见 [开销基线](tool-search/SCHEMA-BASELINE.md)。

未执行真实 Anthropic/其他 provider 网络调用、外部 MCP 服务、Desktop 与手机实机断线重连，以及 macOS/Linux 文件系统测试。双链路证据是运行时/协议集成测试，不能替代这些实机验收。

文件 revision 检查与 OS 提交不是跨进程事务锁；多文件提交按已确认规则允许部分成功。混合换行沿用现有端口的主换行策略，不承诺逐字节保留混合换行或 BOM。
