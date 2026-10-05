# Subagent 与写入隔离规范

状态：规范草案 v0.3-draft（能力状态以 IMPLEMENTATION-MAP.md 为准）

## 1. 两类 child

现有 `SubagentPort` 针对 native `AgentRuntime` child，不能直接当作 Codex/Claude/Pi 的通用 backend 接口。设计上分为：

| 类型                   | 所有者                                            | 默认权限                 | 适用任务                                          |
| ---------------------- | ------------------------------------------------- | ------------------------ | ------------------------------------------------- |
| native child           | parent `AgentRuntime` + Subagent registry         | 继承受限 profile         | explore、review、局部实现                         |
| external backend child | `AgentBackendRegistry` + adapter process registry | capability contract 决定 | Codex/Claude/Pi/DeepSeek explore/review/implement |

二者都向 parent 返回统一事件，但 session、transcript、进程树和 approval owner 各自独立。parent 只能通过公开 control port 发消息、steer、interrupt、wait 或 stop。

## 2. Child contract

```ts
interface ChildAgentRequest {
  parentSessionId: string;
  parentTurnId: string;
  parentToolCallId: string;
  backendId: string;
  taskType: "explore" | "review" | "implement";
  writeIntent: "none" | "worktree" | "lease";
  prompt: string;
  workspaceIdentity: string;
  workspacePath: string;
  workspaceHandle: string;
  depth: number;
  maxTurns?: number;
  traceId: string;
}

interface ChildAgentReceipt {
  childSessionId: string;
  taskId: string;
  status: "accepted" | "running" | "completed" | "failed" | "blocked" | "cancelled" | "lost";
  delivery: "queue_only" | "trigger_turn";
}
```

`accepted` 只表示 admission 成功。child 启动失败、进程退出或 backend 不支持能力都必须产生终态事件，不能永远停留在 running。child 启动采用 reservation；spawn 失败、parent shutdown 或超出 depth/max threads 时自动释放 reservation 和 graph edge。

## 3. 归属、mailbox 和消息

parent session 是 child 唯一 owner。child event 包含 `parentSessionId`、`parentToolCallId`、`childSessionId` 和 sequence，父 session 只保存摘要、evidence refs 和 final output；不要把 child 全部 transcript 双写进 parent history。

external child 的 implement admission 还必须检查 `AGENT-BACKENDS.md` 中的 `approval.level`、`worktree.level`、`evidence.level` 和 `interrupt.level`；其中任一不满足 implement 门槛 时，Runtime 在 child 启动前拦截写入型任务，降级为只读/建议模式并返回 `unsupported`；不能启动后再依赖 prompt 要求它自觉不写。

发送消息分两类：

- `queue_only`：写入 child mailbox，不加载或触发 child turn。
- `trigger_turn`：只有 child 当前可用且 backend 声明 steer/queue 时才触发；否则返回 unsupported。

child 被卸载时 mailbox 保留；重新加载必须经过 parent registry ownership 校验，防止任意 session 通过 id 恢复另一个 child。

## 3.1 编排图与结果合并

parent 以 DAG 编排 `planner → implementer → verifier → reviewer`，允许 explore fan-out 后 map/reduce。每个 child 返回 patch/diff、base/after workspaceRevision、verification evidence、changed files、失败分类、成本和 recommendation；parent 按 priority/可信度排序，reviewer 可以 veto。写入 child 的结果只能通过 worktree merge 或 FS-proxy lease apply 合并，不能以最后写入获胜。

parent 预算包含 child token、并发数、wall time 和 repair attempts；child 失败按边传播为 `blocked`/`unverified`，不会静默转为 completed。共享 context 只传 snapshot hash 和允许的 artifact refs，child 不能修改 parent transcript。

## 4. 只读并行和写入隔离

### 4.1 Explore/Review

Explore 只开放 Read/Glob/Grep/受限 Diagnostics；当前内置 Explore profile 仍可能注册 Bash，因此“只读”必须由 `ExecutionDecision`、SandboxProfile 和 Bash argv/cwd policy 强制，而不能只靠工具 allowlist 或 prompt。Review 允许读取 diff 和只读验证。它们可以在同一 workspace snapshot 上并行，不得写入或改变 parent 的 dirty tree。结果必须包含读取的 revision、路径和 evidence refs。

### 4.2 Implement

`taskType=implement` 必须明确 `writeIntent=worktree` 或 `writeIntent=lease`；未声明隔离方式的 implement 只能作为 `writeIntent=none` 的建议任务。写入 child 必须满足以下任一条件：

1. 独立 Git worktree，child 的 `workspacePath` 指向 worktree，完成后由 parent review/apply；
2. 获得 workspace file lease，声明 changed-file ownership，所有写入仍走 FileRevision/CAS。

当前 runtime 复用 parent 的 `executionPort`、`fileSystemPort` 和 workingDirectory，尚不满足此条件；因此 Phase 3 前 implement child 只能返回计划/patch 建议，不能默认直接写主 workspace。

冲突处理：发现同一文件已有 owner、baseWorkspaceRevision 变化或 worktree merge 冲突时，child 进入 `blocked`，把冲突证据交给 parent；不得自动覆盖或以最后写入获胜。

### 4.3 Lease/fencing 合同

`writeIntent="lease"` 仅表示 FS proxy/executor-enforced lease，不表示外部进程直接获得 cwd 写权限。lease 必须包含 `leaseId`、`fencingToken`、owner session/child、canonical workspace identity、claimed paths、base workspaceRevision、TTL、renew/revoke 状态和 commit journal ref。token 失效后 executor 必须拒绝写入；stale owner 只能得到 `stale_owner`。

## 5. 取消、超时和进程树

取消传播顺序为 parent request → child control → adapter process group → descendants → final status event。超时只触发取消流程，不是假设进程已退出。process registry 要记录 pid/handle、cwd、workspaceIdentity、start time 和 termination result；无法确认退出时标记 `lost` 并禁止复用旧句柄。

parent shutdown 先阻止新 child admission，再等待 active child 进入终态或执行明确 kill。child 的 approval pending、artifact 写入和 mailbox 都必须清理或标记 unknown。

## 6. Residency 和资源上限

child registry 支持最大 active threads、最大 depth、每 backend 并发数和总 command budget。内存压力下只能卸载 completed/failed/cancelled、无 active turn、无 pending trigger 的 child；卸载前转移未读 mailbox，重新加载后只从 owner registry 恢复。

## 7. 验收

- 两个只读 Explore 能并行，且 parent 的文件 workspaceRevision 不改变。
- 两个 implement child 不能同时持有同一文件 lease；冲突可观察且不丢写入。
- child 进程崩溃、取消、超时都有终态，parent 不会永久等待。
- parent resume 后能恢复 child 摘要和 mailbox；不会重复触发已完成 child turn。
- external backend child 的 transcript、approval 和 process state 不会被错误写入 parent transcript。

## 规范补充：AgentControl、residency 与事实语义

AgentControl 的最小控制面必须覆盖 `identity`、`resolve`、`spawn`、`send`、`take_mailbox`、`watch_mailbox`、`ensure_child_loaded`、`interrupt`、`list`、`child_agent_paths`、`check_turn_admission`、`admit_turn`、`record_usage`、`turn_finished`、`service_tier`、`propagate_config_update`、`get_guardian_package`、`pending_budget_reminder`、`mark_budget_reminder_delivered`。`DeliveryReceipt.submission_id` 只表示 accepted，不表示 child 已处理；`AgentInfo::Unloaded` 只表示 registry 中仍有成员，不表示 completed。

`QueueOnly` 只写 mailbox，`TriggerTurn` 才启动 turn；mailbox watcher 必须在加载 child 前建立，避免漏事件。`admit_turn` 是 capacity check 加 running count 的独立检查，不提供原子 reserve，reservation 需要 `pending_slots` 的 RAII commit/release。residency 只能在 terminal、无 active turn、无 durable sleep、无 trigger mailbox 后卸载；卸载失败要保留 runtime。卸载前必须 drain queue-only mail 并回邮箱，不能静默丢弃。

Explore profile 的只读限制必须在 ExecutionDecision/SandboxProfile 强制执行，Bash 只能允许明确的只读 argv/cwd；prompt 白名单不足以提供安全保证。
