# Coding-first UX 规范

状态：规范草案 v0.3-draft（能力状态以 IMPLEMENTATION-MAP.md 为准）

## 1. 用户心智模型

界面围绕一个可恢复 coding session 展示：当前目标、阶段、正在执行的工具、变更 diff、验证 evidence、审批和子 Agent。UI 是 projection，不是第二个 runtime；任何按钮都提交 protocol command，不能直接调用 Repo/Service 或修改本地事实状态。

主界面应能在不展开完整日志时回答四个问题：Agent 正在做什么、改了哪些文件、验证是否真实执行、下一步需要用户什么决定。

## 2. 核心区域

| 区域         | 内容                                                                   |
| ------------ | ---------------------------------------------------------------------- |
| conversation | 用户输入、计划、解释、最终结果和结构化 item                            |
| activity     | 当前 coding phase、model/tool/backend 状态、可取消操作                 |
| diff         | changed files、hunk、workspaceRevision/gitRevision、冲突和外部编辑提示 |
| verification | 命令、cwd、退出码、诊断、artifact、passed/failed/unverified/blocked    |
| approvals    | 风险、资源、命令、sandbox、过期时间和 allow/deny/modify                |
| agents       | child task、backend、状态、摘要、取消和结果引用                        |

## 3. 交互语义

- `Stop` 发送 interrupt，显示 cancelling，等 runtime 终态后才显示 stopped。
- `Steer` 只有 capability 支持时启用；否则引导用户 queue 新 turn。
- `Resume` 显示未完成 request、unknown tool result 和 backend non-resumable 限制，不自动重放未知操作。
- `Apply`/`Revert` 操作作用于明确的 diff/checkpoint；transcript rewind、checkpoint restore、Git revert 是三种不同命令，不能合并成一个“撤销”。
- `Commit`、`Push`、发布和 workspace 外写入默认需要单独确认。

## 4. 状态和证据显示

阶段来自 `CodingPhaseChanged` event；无事件显示 unknown。完成卡片必须列出变更文件、实际验证命令和状态。`unverified` 使用清晰的“未验证”文案，不能用绿色成功样式。长日志通过 artifact link 分页读取，保留首条错误和最后诊断。

## 5. 移动端/远程

移动端优先显示 snapshot、当前状态、审批和最近 item；完整 diff/日志可分页展开。远程重连显示 replaying/sequence gap，而不是把旧的 optimistic overlay 当成新事实。relay 或 Main 的实现细节不出现在用户流程中。

## 6. 验收

- 用户能区分 planning、editing、validating、waiting approval 和 completed。
- 没有 evidence 的结果不会显示为已通过。
- 断线、stale owner、backend unsupported 和 conflict 都有可执行的下一步。

## 补充：coding parity 交互

UI 必须提供持久 terminal（stdin、分页、取消、重连后 artifact 续读）、file tree/search、diff hunk accept/reject、inline edit、diagnostic jump、plan→edit approval、queue/steer、partial success/conflict、resume unknown side effect 和 autonomy profile（plan、build、auto、yolo；trusted repo 是独立 grant）。所有按钮提交 protocol command，显示对应 commandId、approvalId、workspaceRevision 和 evidence 状态。
