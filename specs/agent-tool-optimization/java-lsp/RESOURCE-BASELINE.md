# Java 资源与协议基线

核验日期：2026-10-16。所属设计见 [Java LSP 规范](SPEC.md)。用户已确认随包诊断扩展及五个平台；Windows ARM64 首版明确不支持。以下实际证据不等同于所有平台、构建类型已验收。

## 固定资源

| 组件         | 候选与来源                                                                                                                       | 核验结果                                                                     |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| JDT LS       | [1.62.0，构建 202610131109](https://download.eclipse.org/jdtls/milestones/1.62.0/jdt-language-server-1.62.0-202610131109.tar.gz) | 约 49.1 MB；已下载并比对官方 SHA256。                                        |
| Tooling Java | [Temurin 25.0.4.1+1](https://github.com/adoptium/temurin25-binaries/releases/tag/jdk-25.0.4.1%2B1)，完整 JDK                     | Windows x64 下载、校验及运行通过；其余目标只核验官方资产存在。               |
| Lombok agent | [Maven Central 1.18.48](https://repo.maven.apache.org/maven2/org/projectlombok/lombok/1.18.48/lombok-1.18.48.jar)                | SHA1 与官方 sidecar 一致；已验证项目 Lombok 1.18.30 生成 getter 的类型解析。 |

JDT LS SHA256：`f587dafd8410633c2c2bf005e853a2bbb03cddee88933d49bfe6d9cb1cf09342`。

Lombok SHA256：`85477a4655ebb2c074a9099cfb749be454449fee564d4282610df1b85f7c508b`；SHA1：`6858f13541bab505384f07053c5a7b539bbfd3e3`。该 Central 产物没有 SHA256 sidecar，不把本地计算值称为官方发布值。

### 实际 Java 下界

该 JDT LS tag 的 README、核心 bundle 和 Python launcher 仍显示 Java 21，但实际产物的必要 bundle 已要求 Java 25：

- `org.eclipse.core.filesystem_1.12.0.v20260927-0940.jar`：`Bundle-RequiredExecutionEnvironment: JavaSE-25`。
- `org.eclipse.jdt.core.javac_1.0.0.z20260430-1959.jar`：`Require-Capability: osgi.ee` 要求 JavaSE 25。
- [固定 tag 的 target](https://github.com/eclipse-jdtls/eclipse.jdt.ls/blob/v1.62.0/org.eclipse.jdt.ls.tp/org.eclipse.jdt.ls.tp.target) 也使用 JavaSE-25。

因此整包按 tooling Java 25 验证，不能据 README 宣称 Java 21 可用。项目 JDK 仍单独匹配，不要求所有项目改用 Java 25。

### 平台资产

以下是同一 Temurin release 的完整 JDK，不使用运行时 latest 下载：

| 目标        | 压缩大小（bytes） | SHA256                                                             | 当前验证                     |
| ----------- | ----------------: | ------------------------------------------------------------------ | ---------------------------- |
| Windows x64 |         141167264 | `00c847d804f4a78e9f04f2683faf14fed898535b177b7fc704486cb0284e9283` | 下载、校验、JDT 启动与关闭。 |
| macOS x64   |         120256199 | `e6229d9504f7922053ab31821b9e6bee8761daf7b026a3476d1a027563009880` | 官方资产存在，未实机运行。   |
| macOS ARM64 |         136355078 | `61979887f7506a24a57439ff99adb8b3a7fc89977d9cfe3b8984f58a981b7b9d` | 官方资产存在，未实机运行。   |
| Linux x64   |         141329719 | `dbb698396d478e7fa2b1e50f4103324b2a99b90569ee27c33f2261f9215cf41e` | 官方资产存在，未实机运行。   |
| Linux ARM64 |         140137820 | `69df11a02cfa3ef7d7ca645e03edce6778ec090e100f6ae2b42097865730ac52` | 官方资产存在，未实机运行。   |

Temurin 同版本没有 Windows ARM64 资产，JDT LS 包也没有单独的 Windows ARM64 configuration。该平台首版写入明确的 unsupported manifest，不下载 Java、不启动语言服务，不影响应用其他能力。

JDT LS 项目使用 EPL-2.0，包内第三方组件保留各自 about/license/notice；Temurin 使用 GPLv2 + Classpath Exception，保留实际 legal 目录和相应源码来源；Lombok 使用 MIT。资源已接入发行渠道的随包准备和目标校验，不把构建下载入口变成用户首次使用步骤。

## 构建与分发合同

资源归属 `@zcode/code-development-plugin`（插件 `code-development`，版本 `0.1.0`）。`resources.json` 固定下载地址、文件名、SHA256、JDT configuration 和 Java 解包根；构建工具不得解析 latest。

`scripts/prepare-runtime.mjs` 只在开发准备或发布构建运行。目标由 `--target` 或 `ZCODE_TARGET_OS` / `ZCODE_TARGET_ARCH` 指定，默认构建宿主平台；`--cache-dir` 可复用已验证压缩包。缓存与下载都先校验固定 SHA256，检查归档成员及链接不能逃逸临时解包目录，再解包。Java 扩展必须由构建宿主的 Java 25 编译；跨平台构建绝不执行目标 Java。可通过 `--build-java-home` 明确指定宿主 JDK，否则准备同一固定版本的宿主 JDK。

输出为 `runtime/jdtls`、`runtime/java`、`runtime/lombok.jar`、`dist/java/zcode-java-extension.jar` 和 `runtime/manifest.json`。macOS 将 JDK `Contents/Home` 作为 runtime/java。manifest 包含 `version:1`、`target`、`supported` 及各资源版本、来源归档 SHA256 和相对路径；扩展另记录实际 JAR SHA256。`java.executable` 相对 runtime 根，configuration 是 JDT 包内目录名。unsupported manifest 仅包含目标和原因。

准备过程由包内单一构建入口拥有；先在临时目录完成资源与扩展编译，再替换 runtime。所有删除/移动先验证绝对路径位于该包或显式缓存目录。不同目标串行准备并立即复制到各自 staging，不能让并发构建覆盖共享 runtime。Desktop、SEA、SSH prebuild 和 Server 分发均携带 runtime，并在嵌入前核对目标 manifest；用户首次使用和应用启动不运行下载脚本。只读随包资源与运行期 configuration、workspace `-data` 分离。

跨平台收集不能仅沿用构建宿主的 `stat.mode`：Windows 上无法据此恢复 Unix 执行位。SEA 与 filesystem seed 对 `runtime/java/bin/*` 和 `runtime/java/lib/jspawnhelper` 明确记录/写入 `0755`，其他资源保持适当只读权限；不依赖用户首次启动时 chmod 只读安装目录。

## 诊断协议证据与扩展

[BaseDiagnosticsHandler](https://github.com/eclipse-jdtls/eclipse.jdt.ls/blob/v1.62.0/org.eclipse.jdt.ls.core/src/org/eclipse/jdt/ls/core/internal/handlers/BaseDiagnosticsHandler.java#L144-L151) 不发送诊断 version；该版本也未实现标准 pull diagnostics。[DiagnosticsCommand](https://github.com/eclipse-jdtls/eclipse.jdt.ls/blob/v1.62.0/org.eclipse.jdt.ls.core/src/org/eclipse/jdt/ls/core/internal/commands/DiagnosticsCommand.java#L47-L134) 的 refresh 等待 document lifecycle，但不等待独立 publish jobs，通知不关联 request ID，部分失败也返回 null。因此通知到达时间、命令返回或客户端最新版本都不足以证明 fresh。

已确认扩展使用 `org.eclipse.jdt.ls.core.delegateCommandHandler`，通过 initializationOptions.bundles 加载固定 jar。一个 handler、collector 和结果 DTO 完成：

1. 宿主先按文档顺序同步，再传入 URI 和 expected content hash。
2. 扩展读取服务端 primary working copy，注册短期 buffer 变更监听，校验内容 hash。
3. 用每请求独立的 `WorkingCopyOwner` 创建副本，仅修改副本内容，通过自有 `IProblemRequestor` 同步 reconcile 并收集诊断。
4. 返回实际分析内容 hash、diagnostics 与 current/stale/unavailable 状态；primary 内容变化或监听到中间变更则返回 stale，取消返回协议错误。项目模型状态由宿主另行核验。
5. finally 移除监听并 discard 副本；宿主再核对当前内容、workspace generation、server epoch，匹配后才能关联本地版本。

已通过官方源码及实际 JDT jar 的 javap 核验上述 API。无需反射、访问 JavaModelManager 或修改 primary buffer。`workspace.run` 不能排除 didChange，不能用它冒充文档锁。服务端 hash 来自实际内容，不回显客户端 version 冒充证明；文件快照也不代表全项目依赖处于同一事务快照。

扩展使用的 JDT LS handler/utils 位于 internal 包，必须与固定 JDT LS 组合编译、分发和验收。原生无版本通知仍保持 unknown/stale。扩展已完成真实 stdio 验证：注册、错误诊断、修改后空诊断、hash 不符、取消后下一请求、关闭文档；证据见 `.tmp/java-extension-verification-20261016/evidence.json`。

## 已验证的项目组合

Windows x64 上通过生产 adapter 验证了 Java 17 Maven 多模块与 Gradle 9.2.0 多模块：跨模块定义、workspace symbol、项目 Lombok 1.18.30 getter 消费、类型错误以及修复后的 current 空诊断。Maven fixture 由固定 JDT LS 的 m2e 导入，使用 maven-compiler-plugin 3.11.0；该证据不等于验证任意 Maven CLI 版本。项目 Lombok 依赖版本与随包 agent 1.18.48 分别记录，不混称同一个版本。

Maven CRLF fixture 进一步验证保留原始换行的 FileSystemPort 读取，以及受限 child/已禁用 lease 的 analyze:false 提交同步既有共享服务。查询未证明全项目索引一致时保留 unknown；只有文件内容 hash 快照及宿主运行代次一致时诊断为 current。

证据为 `.tmp/java-build-projects-20261016/maven-runs/1792150481998/evidence.json` 与 `gradle-runs/1792150558719/evidence.json`。其他 Java 版本、Lombok 版本、构建插件和平台仍未逐一验证；Java 8/21 出现在候选列表不代表各版本项目兼容性已经通过。

## 本机真实启动验证

Windows x64 固定组合在独立临时 fixture 中完成 JSON-RPC：initialize 返回于 3.925 秒，language/status Started / Ready 于 3.937 秒，shutdown 应答于 3.953 秒，4.883 秒 exit 0，进程已回收。JDK 固定包下载 47.2 秒，下载与解包合计 49.7 秒。

未改全局 JAVA_HOME/PATH、用户配置或只读 Java 资源目录；configuration 与 `-data` 均独立放在临时目录。上游 incubator/Unsafe 警告未导致失败。Maven/Gradle 导入关闭，项目 JDK 17 配置只存在于临时 Eclipse workspace。

上述原始启动实验只证明协议初始化、就绪和正常关闭。后续扩展与项目验收见前文；资源构建验收已验证 Windows x64 缓存准备、staging 完整性、SEA 资源采集、目标不匹配拒绝，以及 Windows ARM64 unsupported 路径不下载或编译。资源证据见 `.tmp/code-plugin-resource-verification-20261016/evidence.json`。这些检查不代表完整 SEA 可执行文件、其他平台实机或整套桌面 E2E 已验收。Ready 不等同于项目构建或诊断完成。

本机忽略目录 `.tmp/java-resources-20261016/` 保留 `resource-evidence.json`、`java25-resource-evidence.json`、`last-smoke.json` 及完整运行证据。第三方资源供后续实现验证复用，不随 Git 提交。
