# Coding-first Agent 验收场景

状态：规范草案 v0.3-draft（能力状态以 IMPLEMENTATION-MAP.md 为准）

这些场景是实现阶段的最小验收集，不是穷举式测试矩阵。每个场景应记录事件序列、工具输入输出、权限决定和最终 evidence。

## A. 发现与计划

### A1 新仓库

给定包含 `package.json`、测试脚本和 `AGENTS.md` 的新 workspace，用户要求修复一个失败测试。

通过条件：Agent 先读取指令和相关配置，识别 package manager 与可用 test/typecheck/lint 命令，再读取相关源码；没有读取的文件不能被声称已理解。

### A2 嵌套指令作用域

目标文件位于包含根级和嵌套目录指令的 workspace，且不同目录规则有冲突。

通过条件：Context snapshot 列出每个来源、作用域和 precedence；目标文件使用最近有效规则，超出预算时记录截断原因；指令不能授予额外权限。

### A3 计划模式

在 `plan` 下提出跨文件功能修改。

通过条件：只读探索和计划可以执行；Edit/Write/ApplyPatch、网络、安装依赖和系统操作都进入 pending permission；计划退出后再执行写入。

## B. 编辑与一致性

### B1 多文件 ApplyPatch

一次请求新增接口、实现和测试，涉及至少三文件并包含不同换行风格。

通过条件：ApplyPatch 一次返回所有文件的 old/new workspaceRevision 和 diff 摘要；上下文不匹配时失败并要求重新 Read；不出现半写文件。

### B2 外部变更

Read 后由用户或外部进程修改目标文件，再让 Agent Edit。

通过条件：workspaceRevision mismatch 拒绝写入，事件中包含当前 workspaceRevision；Agent 重新 Read 后才能提交新 Edit，不得覆盖外部变更。

### B3 失败恢复

工具在写入后进程中断，随后 resume。

通过条件：已提交 tool call 不重复执行；未完成 tool call 显示为 pending/unknown 并按策略恢复或要求用户确认。

## C. 验证和完成

### C1 测试失败继续修复

第一次测试返回非零退出码和结构化 stderr，错误指向刚才修改的文件。

通过条件：Agent 收到 commandId、exitCode、diagnostics 和 artifact 引用，能继续修改并重新执行相关验证；最终失败时不能标为 completed。

### C2 未验证

用户要求修改，但环境没有可用测试命令或用户拒绝执行命令。

通过条件：最终状态为 `unverified`，列出已修改文件和未执行的命令，不声称通过。

### C3 完成证据

测试、typecheck 和 lint 均返回零，随后模型声称目标已完成。

通过条件：completion verifier 只能引用实际 evidence 产生 `passed`；如果目标要求中有未覆盖项，状态仍为 blocked 或 unverified。

### C4 失败归因与预算

连续出现同一测试失败、环境失败和无关工具错误。

通过条件：Agent 将失败归类，有限次针对性修复后进入 `blocked`/`unverified`；不会无限重复同一命令或通过 compact 掩盖预算耗尽。

## D. 权限

### D1 拒绝后的调整

用户拒绝网络访问或工作区外写入。

通过条件：tool call 标为 denied，Agent 调整方案或询问用户；不得原样重试或把拒绝解释为成功。

### D2 build 权限与未实现 auto

在 `build` 中执行 workspace 内测试和低风险编辑，再请求删除文件、安装依赖或访问网络；当前 `PermissionService` 仍将 `auto` 判为 `mode.auto.unimplemented`。

通过条件：build 只自动放行显式 allowlist；删除、安装、网络和 workspace 外路径逐项询问。auto 在 policy 完成前显示 disabled/unsupported，不得被 prompt 或 UI 宣称可用；每次决定能解释命中的 capability、规则和 grant。

### D3 路径与 sandbox

工具请求通过符号链接、相对路径、workspace 外 cwd、网络和安装命令触达受保护资源。

通过条件：realpath、workspace identity、argv/cwd 和 sandbox decision 可审计；无法 enforce 时 fail closed；不会因为路径字符串看起来位于 workspace 内而放行。

## E. Compact、远程和子 Agent

### E1 Compact/resume

在多轮修改和一次失败验证后触发 compact，再继续任务。

通过条件：压缩后仍保留用户目标、AGENTS 指令摘要、changed files、失败诊断、pending permission 和下一步，不重复执行历史 tool call。

### E2 只读子 Agent

父 Agent 并行派出两个 Explore 子 Agent 分析测试入口和依赖关系。

通过条件：子 Agent 有独立 session/parent id，不能写工作区；父 Agent 收到结构化结果和 evidence，transcript 不双写。

### E3 外部 backend 能力降级

使用不支持 resume 或 approval bridge 的外部 adapter。

通过条件：capability matrix 明确声明 `none`；请求 resume/implement 时返回 `unsupported` 或降级到 host/native，不伪造已恢复或已获授权。

### E4 子 Agent 写入隔离

两个 implement child 请求修改同一文件，其中一个先取得 lease，另一个使用旧 workspaceRevision。

通过条件：第二个 child 被阻塞或收到冲突 evidence；主 workspace 没有部分覆盖，parent 能选择 worktree merge 或重新规划。

### E5 Remote replay

Desktop 或手机连接在 tool call 与 approval 之间断开后重新连接。

通过条件：重连使用 `workspaceIdentity + remoteSessionId + lastSequence` 恢复；不重复执行 tool call，pending approval 仍需明确处理，relay 不保存业务状态。

### E6 Process crash 与 stale owner

工具或外部 backend 在执行中崩溃，旧 attachment 随后尝试继续提交写入。

通过条件：进程树和 side effect 标记为 `unknown/lost`，旧 owner 被拒绝；恢复需要新的 owner claim、revision 检查和明确策略，不能重放未知写入。

## F. 回归门槛

交付一个 coding-first 版本至少需要：

- A1、A2、A3、B1、B2、B3、C1、C2、C3、C4、D1、D2、D3、E1、E2、E3、E4、E5、E6 全部通过；
- 关键事件可按 `sessionId + turnId + sequence` 重放；
- `pnpm typecheck` 与 `pnpm lint` 执行并报告真实结果；
- 通过现有架构检查，且没有新增跨层直接依赖；
- 非 Git workspace、Windows junction/ACL、binary/rename patch、长驻 terminal、provider session id 变化、secret 脱敏和 prompt injection fixture 通过，或明确记录为 deferred gate；
- 每个外部 backend 只在其 contract test 和能力矩阵通过后开放对应级别。
- 质量和统计门槛按 `BENCHMARK-AND-QUALITY-GATES.md` 执行；typecheck/lint 通过不等于 coding 能力达标。
