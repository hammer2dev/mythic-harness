# Remote Control Bot Channel Entry

Mythic Harness 桌面一级导航在设置按钮上方显示手机图标。点击后打开 Bot Channel 弹窗，提供微信、飞书、Lark、Telegram 和「机器人管理」。入口独立于官方手机 Web 配对及其账号开关。共享的 Bot Channel 列表也供原 Web 远控弹窗使用。

Bot Channel card 的点击逻辑统一打开 `packages/ui/src/BotsDialog.tsx`：

- 如果已有对应渠道的机器人，选中该渠道的第一个机器人。
- 如果没有对应渠道的机器人，直接创建该渠道的新机器人，并进入该机器人的配置流程。

入口选择逻辑集中在 `resolveBotProviderEntry()`。机器人管理复用现有配置与授权，桌面入口不启动手机 Web relay。
