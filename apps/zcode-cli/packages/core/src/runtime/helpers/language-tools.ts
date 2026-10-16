import type { AgentRuntimeInternal } from "../internal.js";
import { lspToolEntry } from "../../tool/handlers/lsp.js";
import { javaRuntimeToolEntry } from "../../tool/handlers/java-runtime.js";
import { createToolRuleNameSet } from "../../tool/tool-visibility.js";
import { resolveBuiltInToolAllowlist, resolveRuntimeDisallowedTools } from "./tool-allowlist.js";

/** 插件资格与模型曝光分离；禁用后不能由恢复的 ToolSearch 标识重新注册。 */
export function synchronizeRuntimeLanguageTools(runtime: AgentRuntimeInternal): void {
  const allowed = resolveBuiltInToolAllowlist(runtime.config);
  const denied = createToolRuleNameSet(resolveRuntimeDisallowedTools(runtime.config));
  for (const entry of [lspToolEntry, javaRuntimeToolEntry]) {
    const name = entry.metadata.name;
    const eligible =
      runtime.languageServicePort?.enabled === true &&
      (name !== "JavaRuntime" || runtime.javaRuntimePort !== undefined) &&
      (!allowed || allowed.includes(name)) &&
      !denied?.has(name);
    const registered = runtime.registry.get(name) !== undefined;
    if (eligible === registered) continue;
    if (eligible) runtime.registry.register(entry);
    else runtime.registry.unregister(name);
    runtime.invalidateToolCache();
  }
}
