# @zcode/node-repl-host

Browser Use 的 `node_repl` MCP 宿主，提供 `js` 工具、浏览器 bridge 和进程生命周期管理。每次调用使用新的 kernel；stdio 调用通过独立 Worker 隔离模块缓存，浏览器会话仍由 BrowserControl 管理。

`bootstrap/src/app/built-in-node-repl.ts` 仅在 Browser Use 启用时注册宿主。浏览器插件提供自己的 skill、文档与 client script，宿主产物 `dist/mcp/server.js` 由本包的 `scripts/build.mjs` 构建，随独立 node-repl-host seed 分发。

当前宿主不装配 Computer Use runtime、broker 或 SDK bridge。结果转换中保留的 CUA 图片与应用元数据契约用于兼容历史工具结果。
