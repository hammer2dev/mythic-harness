import type { JavaRuntimeInput, JavaRuntimeOutput } from "../tools/java-runtime.js";

/** 执行端的 JDK 配置命令；写调用必须先通过当前 Runtime 的真实用户意图校验。 */
export interface JavaRuntimePort {
  execute(input: JavaRuntimeInput): Promise<JavaRuntimeOutput>;
}
