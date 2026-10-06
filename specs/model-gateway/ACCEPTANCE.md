# 模型网关验收记录

日期：2026-10-05。基线：`46c2cbd2dceac38300b065ea7477db5ffdd80b85`，本轮改动尚未提交。共 27 个文件，增加 675 行、删除 167 行，净增 508 行；不含用户已有的暂存删除。

## 环境

- Node 使用 `mise.toml` 指定的 24.14.0。
- Web 通过独立 Vite `127.0.0.1:5192` 连接独立 HTTP 服务 `127.0.0.1:3048`；UI 使用当前源码。
- 最终验收数据目录为 `C:/Users/Administrator/AppData/Local/Temp/zcode-model-gateway-e2e-20261005-b19f/home2`，同时设置 `ZCODE_DATA_BASE_DIR` 和 `ZCODE_DESKTOP_HOME_DIR`。`ZCODE_SERVER_WORKSPACE` 指向同一测试根目录的 `workspace`。
- 仅创建合成自定义供应商，Base URL 为 `https://gateway-example.invalid/v1`，未填写凭据、发起模型请求或安装插件。
- 浏览器视口验证了默认 1280×720、390×844 与 390×360，结束后恢复默认视口。临时页面和服务在验收结束后关闭。

## 实际交互

| 场景                     | 结果                                                                                                       |
| ------------------------ | ---------------------------------------------------------------------------------------------------------- |
| 点击一级模型网关         | 网关高亮，二级仅模型设置、使用统计，默认模型设置                                                           |
| 统计页重复点击网关       | 保持 usage，不重置子页；侧栏收起时重新展开                                                                 |
| 从设置重新进入网关       | 默认模型设置，退出设置覆盖层                                                                               |
| 网关二级历史             | 后退恢复模型设置，前进恢复使用统计                                                                         |
| 设置分类清理             | 模型设置、使用统计及空的数据与统计分组均已移除；基础设置和 Agent 能力仍可访问                              |
| 聊天模型菜单、缺模型配置 | 两个入口均进入网关模型设置                                                                                 |
| 子智能体管理模型         | 未保存表单的模型菜单进入网关，设置不再覆盖正文                                                             |
| 返回项目                 | 原未发送草稿保持                                                                                           |
| 原模型编辑保存           | 创建合成供应商；修改 Base URL 后切换统计再返回，连接配置仍在；模型元数据对话框取消后没有新增模型           |
| 390px 抽屉               | 二级分类保留文字；选择分类后关闭；Escape 和右侧可见遮罩关闭后仍保持子页；隐藏导航有 inert/aria-hidden 边界 |
| 窄屏正文                 | 页面宽度等于 390px，没有横向页面溢出；空模型提示改为最小高度，换行不再越过虚线框                           |
| 390×360 矮窗口           | 网关标题和两个分类均可达                                                                                   |
| 统计作用域与失败         | 本机 Host 范围提示可见；无活跃 CLI 时保留 `no_active_workspace` 错误，不伪造成功统计                       |

截图保存在上述测试根目录：`gateway-wide.png`、`gateway-narrow-drawer.png`、`gateway-narrow-editor.png`。

## 代码验证

- `pnpm typecheck`：通过。
- `pnpm lint`：0 错误，17 项未改文件中的已有告警；本轮改动没有新增告警。
- `pnpm architecture:check --changed`：通过，违规／基线／新增均为 0；代码改动仅涉及 UI 模块，另更新 spec 和功能图。
- `pnpm exec oxfmt --check <本轮 27 个文件>`：通过。
- `git diff --check`：通过。
- 核心导航与相关回归测试：14 项通过，0 失败。执行前设置 `TSX_TSCONFIG_PATH=F:/Project/mythic-harness/mythic-harness/packages/ui/tsconfig.json`，使用下列实际入口：

```text
node --import tsx --test packages/ui/test/modelGatewayNavigation.test.ts packages/ui/test/modelGatewayNavigationHistory.test.ts packages/ui/test/projectNavigation.test.ts packages/ui/test/workflowNavigation.test.ts packages/ui/test/savedWorkflowNavigation.test.ts
```

核心用例覆盖一次性导航事件、分类历史及身份隔离，并复用已有项目 scope 测试。本地连通性 cwd 复用已有解析器，经过源码核对。App 是唯一网关分类所有者，导航历史负责回放；页面只投影导航并使用原业务服务。没有修改 Host、协议或远程恢复时序。

## 未验证边界

- 未启动原生 Electron 窗口，未验证 macOS 原生窗控或真实手机远控。
- 未连接真实远端 Host。模型配置的根 Host 边界、统计的当前 Host 边界和本地测试 cwd 经过源码检查；项目 scope 和 identity 由核心测试验证，不能视为真实远端端到端验收。
- 独立 HTTP 服务没有桌面 `window-controller` channel，已有置顶列表加载会超时；本次不修改该服务能力。
- 未运行真实模型、连通性网络探测或真实 CLI 用量聚合。
- 开工 freshness fetch 受到 GitHub 网络连接失败影响；`--no-fetch` 检查通过，dev 与本地 origin/dev 同步。

保留用户已有的 `packages/services/test/publicClientPolicy.test.ts` 暂存删除，未恢复、未提交。
