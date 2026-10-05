# Coding-first 实现映射与迁移顺序

状态：v0.3-draft（2026-10-05）

本表把设计能力映射到现有模块，防止实现把未来接口误当成已存在功能。状态以源码和可执行 fixture 为准。

| 能力                        | 现有 owner/入口                                         | 状态                                         | 迁移动作                                                     | 验收证据                            |
| --------------------------- | ------------------------------------------------------- | -------------------------------------------- | ------------------------------------------------------------ | ----------------------------------- |
| session/turn admission      | `apps/zcode-cli/packages/core` + Host `CommandInbox`    | `implemented`                                | 保留 owner/lease/stale-run 边界                              | duplicate submission/replay fixture |
| SessionEvent contract/store | contracts `session.events.ts` + runtime/session store   | `implemented`（contract/store owner 已存在） | 补 coding item、backend、verification 映射                   | cold merge/replay fixture           |
| ApplyPatch                  | `contracts/src/tools/apply-patch.ts`；handler 尚不完整  | `contract-only`                              | 实现 parser、CAS、atomic multi-file commit                   | patch correctness fixture           |
| GitStatus/GitDiff           | core built-in 尚未完整闭环                              | `blocked`                                    | 加 structured handler、dirty baseline、rename/submodule 语义 | git fixture                         |
| Diagnostics/test discovery  | 目前以 Bash/局部 adapter 为主                           | `blocked`                                    | 建 structured diagnostics 和 test manifest                   | failure classification fixture      |
| persistent terminal         | execution port 尚未提供完整 session 语义                | `contract-only`                              | 加 stdin、分页、process tree、timeout、artifact cursor       | long-running command fixture        |
| permission `auto`           | `PermissionService` 返回 `mode.auto.unimplemented`      | `blocked`                                    | 先实现 capability-scoped build profile                       | policy fixture                      |
| completion verification     | `target-completion-verification.ts` 存在 fail-open 风险 | `blocked`                                    | fail-closed evidence reducer，绑定 workspaceRevision/hash    | evidence fixture                    |
| nested context              | context adapter 只覆盖有限路径                          | `contract-only`                              | root→nested 累积、provenance、预算和刷新                     | monorepo context fixture            |
| native child isolation      | `SubagentPort` 复用 parent FS/execution                 | `blocked`                                    | worktree/file lease/fencing token                            | conflict fixture                    |
| external adapter            | registry/adapter 尚属设计合同                           | `proposed`                                   | 先做 delegated explore/review，再做 implement                | adapter contract fixture            |
| remote projection           | zcode protocol v4 与 Desktop/Web reducer                | `implemented`（现有语义）                    | 新增 item 前同步 normalizer/schema/codegen                   | reconnect/replay fixture            |

## 迁移顺序

1. 冻结 canonical schema、revision 分层、phase reducer 和 capability handshake。
2. 以 bugfix、多文件 API、失败修复三个垂直切片交付 native 工具、context、验证、UX 和 benchmark。
3. 再交付 worktree/lease 子 Agent；其后才接 external delegated adapter。
4. external implement 只有在 FS proxy 或 executor sandbox 的事前写入约束和 L5 恢复证据同时通过后开放。
5. 每次迁移均保留 feature flag、旧事件 normalizer 和 rollback fixture；不通过门禁时回退到 native backend。
