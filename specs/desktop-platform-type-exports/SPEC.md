# 桌面平台类型导出

- `platform.ts` 是桌面缩放与窗口控件协议类型的唯一定义位置。
- `@zcode/shared` 公共入口必须导出 `DesktopZoomState`、`WindowControlsOverlayMetrics` 和 `WindowControlsOverlayReadyPayload`，供 preload 和 Main 使用。
- 本次仅补齐类型导出，不改变 IPC、窗口行为、状态所有者或持久化，不涉及数据迁移。
- 验收：preload 类型检查不再报告这三个类型缺失；执行仓库类型检查、Lint 和架构检查，分别记录其他已有问题。
