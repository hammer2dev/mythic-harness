# Coding-first 实施路线图

状态：规范草案 v0.3-draft（能力状态以 IMPLEMENTATION-MAP.md 为准）

## Phase 0：合同冻结

目标：冻结 coding profile、事件 envelope、capability registry、workspace/owner 约束、schema version/迁移策略和评测基线 manifest。

交付：本目录规范、protocol schema 草案、最小 telemetry、native/external/backend 的 owner 矩阵。

退出条件：没有实现能力被 prompt 或 UI 宣称为可用；所有新增事件列出 contract、projection 和 replay 位置；benchmark baseline、feature flag 和回滚路径已登记。

## Phase 1：Native coding parity slice

目标是交付可在真实仓库完成 bugfix、多文件 API 和失败修复的 native coding loop，包含：

1. coding profile、稳定 tool catalog 和 nested context discovery；
2. Read/Glob/Grep、Edit/Write、ApplyPatch（parser、CAS、commit journal/recovery）；
3. persistent Terminal（stdin、分页/续读、timeout、process tree、cancel/reconnect）；
4. GitStatus/GitDiff、structured Diagnostics、test discovery 和 targeted test；
5. repo/package/import/export map、symbol/reference 查询、token-aware ranking 和 context invalidation；
6. verification evidence、failure classifier、repair budget、fail-closed completion gate；
7. 对应 prompt、UX、replay 和 benchmark 垂直切片。

出口：patch correctness、verification truthfulness、stale workspaceRevision/log revision、long command、external edit 和 prompt injection fixture 全部通过；未实现的工具显示 `blocked`，不得以 Bash fallback 假称 parity。

## Phase 2：权限、恢复与投影

实现 `build` policy、路径 realpath scope、命令 argv policy、sandbox adapter、pending approval registry、compact/resume、coding event projection 和 remote replay。`auto` 在规则完整前保持 disabled。

退出条件：审批 deny/modify/expiry、进程取消、断线重连和 stale owner 场景可回放。

## Phase 3：Subagent 隔离

实现 child reservation、canonical path、depth/max threads、mailbox、QueueOnly/TriggerTurn、只读并行，以及 implement child 的 worktree/file lease。补 process registry 和取消传播。

退出条件：子 Agent 不会双写 transcript、越权恢复或并发覆盖文件。

## Phase 4：External backend adapters

顺序建议：Codex app-server stdio → Claude 可脚本化协议/SDK → Pi → DeepSeek Harness。每个 adapter 单独 contract test、capability matrix、进程树和失败降级。默认仅 explore/review；implement 需要 approval、interrupt、evidence 和 isolation 全部具备。

退出条件：同一 benchmark 上 adapter 的事件、权限、恢复、成本和质量可比较。

## Phase 5：编码智能和性能

在 native parity 和 adapter 安全门槛通过后，补 AST/LSP 深度索引、复杂依赖影响分析、prompt/context ablation、model routing、并行度、compact 优化和 UI 性能。外部 backend 的主 session 资格只能通过 L5 gate，不能因为 Phase 5 的智能优化而绕过写入隔离。

## 依赖和禁止事项

依赖顺序不能倒置：事件合同 → native facts → projection/replay → isolation → adapter → UI/品牌迁移。不要先改名 `zcode-cli`、先接多个外部 CLI 或先做复杂多 Agent 编排；这些会掩盖 native loop 和事实所有者缺陷。

## 规范补充：阶段出口和迁移门禁

Phase 0 的出口必须包括 canonical schema/codegen、迁移脚本、contract fixtures、事件 replay fixture、权限 fixture 和 adapter fixture。Phase 1 以后每个阶段都必须通过 `pnpm typecheck`、`pnpm lint`、`pnpm architecture:check --changed`，并执行与本阶段相关的 replay、permission、compact、adapter contract fixture；门禁未通过不得把 UI 或外部 backend 作为完成状态发布。

## 垂直切片门禁

每个切片必须同时交付工具 handler、context/prompt、verification/evidence、UX projection、contract/replay fixture 和 benchmark manifest。Phase 0 的合同冻结不能阻塞第一个切片，但所有实验接口都必须标记 `contract-only` 或 `proposed`，有明确 owner、迁移顺序和 rollback。
