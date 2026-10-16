# 通用代码开发插件

内置插件 `code-development` 的首版提供 Java LSP 导航、符号与诊断。ToolSearch 可发现插件原生 LSP 工具；语言服务在查询或实际编辑时启动。插件停用后释放语言服务资源。

发布资源由 `scripts/prepare-runtime.mjs` 准备，应用运行时不联网安装 JDT LS 或 Java。支持 Windows x64、macOS x64/ARM64、Linux x64/ARM64；Windows ARM64 保留明确的 unsupported manifest。

```powershell
node scripts/prepare-runtime.mjs --target win32-x64 --cache-dir <资源压缩包目录> --build-java-home <构建宿主Java25目录>
```

省略参数时，目标使用 `ZCODE_TARGET_OS` / `ZCODE_TARGET_ARCH` 或当前宿主平台；缓存默认在包内 `.resource-cache`，也可设置 `ZCODE_JAVA_RESOURCE_CACHE`；构建宿主 Java 可设置 `ZCODE_BUILD_JAVA_HOME`，没有指定时准备固定版本的宿主 JDK。跨平台构建始终使用宿主 Java 编译扩展，目标 Java 只进入分发目录。

固定资源与许可证来源见 `resources.json`。保留 JDT LS 及其第三方 about/license/notice、Temurin legal 目录、Lombok MIT 许可证。资源属于构建产物，不随 Git 提交。诊断内容一致性与扩展升级规则见 [java/README.md](java/README.md)。
