# Git 状态面板修复验证

- `pnpm typecheck`：通过。
- `pnpm lint`：0 错误，60 条既有警告。
- `pnpm architecture:check --changed`：baseline 0 / new 0。
- 修改文件格式检查与 `git diff --check`：通过。
- 实机 E2E：未执行；当前自动化环境无法连接桌面窗口，普通浏览器无法提供 Desktop renderer 所需的 Electron preload。

实机验收时，在 `[data-testid="chat-summary-panel"] [data-status-section="environment"]` 范围内，反复刷新 Git 状态、切换仓库再返回后，`button[aria-label="切换 Git 分支"]`（英文为 `Switch Git branch`）和 `[data-testid="git-action-trigger"]` 应各保留一个，并能打开对应菜单。其余关键场景见 [SPEC.md](./SPEC.md)。
