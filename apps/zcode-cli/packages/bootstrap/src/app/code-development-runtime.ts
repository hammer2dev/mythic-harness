import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CodeDevelopmentPluginPolicyOwner,
  JdkStore,
  createWorkspaceLanguageServiceOwner,
  type JavaProjectConfiguration,
  type WorkspaceLanguageServiceOwner,
} from "@zcode/adapters/language-service";
import type {
  FileSystemPort,
  JavaRuntimePort,
  Logger,
  PluginLoadOutcome,
  WorkspaceLanguageServicePort,
} from "@zcode/contracts";

export const CODE_DEVELOPMENT_PLUGIN_ID = "code-development@zcode-plugins-official";
interface OwnerEntry {
  owner: WorkspaceLanguageServiceOwner;
  users: number;
}
interface PolicyEntry {
  owner: CodeDevelopmentPluginPolicyOwner;
  users: number;
}
const owners = new Map<string, OwnerEntry>();
const policies = new Map<string, PolicyEntry>();

export interface CodeDevelopmentRuntime {
  port: WorkspaceLanguageServicePort;
  jdkStore: JdkStore;
  javaRuntimePort: JavaRuntimePort;
  close(): Promise<void>;
}

export async function createCodeDevelopmentRuntime(input: {
  plugins: PluginLoadOutcome["plugins"];
  cliStorageRoot: string;
  userConfigPath: string;
  projectConfigPath?: string;
  skipUserConfig?: boolean;
  workspaceRoot: string;
  workspaceIdentity?: string;
  fileSystem: FileSystemPort;
  env?: NodeJS.ProcessEnv;
  logger: Logger;
}): Promise<CodeDevelopmentRuntime | undefined> {
  const plugin = input.plugins.find((candidate) => candidate.id === CODE_DEVELOPMENT_PLUGIN_ID);
  if (!plugin) return;
  const policyKey = input.userConfigPath;
  let policyEntry = policies.get(policyKey);
  if (!policyEntry) {
    policyEntry = {
      owner: new CodeDevelopmentPluginPolicyOwner({
        userConfigPath: input.userConfigPath,
        onError: (error) =>
          input.logger.warn("Code Development policy refresh failed", {
            error: error instanceof Error ? error.message : String(error),
          }),
      }),
      users: 0,
    };
    policies.set(policyKey, policyEntry);
  }
  policyEntry.users += 1;
  const activation = policyEntry.owner.acquire({
    workingDirectory: input.workspaceRoot,
    projectConfigPath: input.projectConfigPath,
    skipUserConfig: input.skipUserConfig,
  });
  const releasePolicy = () => {
    activation.close();
    policyEntry!.users -= 1;
    if (policyEntry!.users === 0) {
      policyEntry!.owner.close();
      policies.delete(policyKey);
    }
  };
  const jdkStore = new JdkStore({
    filePath: join(input.cliStorageRoot, "code-development", "jdk-config.json"),
    env: input.env,
  });
  const workspaceKey = input.workspaceIdentity?.trim() || input.workspaceRoot;
  const javaRuntimePort: JavaRuntimePort = {
    execute: async (request) => {
      await activation.refresh();
      if (!activation.enabled)
        return { status: "disabled", message: "Code Development plugin is disabled." };
      try {
        if (request.operation === "list") {
          const discovery = await jdkStore.discover();
          return {
            status: "ready",
            message:
              "JDK candidates in the current execution environment; project matching remains independent.",
            candidates: discovery.candidates,
            issues: discovery.issues,
          };
        }
        if (request.operation === "clearSelection") {
          await jdkStore.setProjectSelection({
            projectKey: workspaceKey,
            purpose: request.purpose,
          });
          return {
            status: "saved",
            message:
              "Explicit JDK selection cleared; the current project resumes automatic matching. Registered candidates and installation files were not changed.",
          };
        }
        if (!request.path) return { status: "failed", message: "A JDK path is required." };
        if (request.operation === "register") {
          const candidate = await jdkStore.register(request.path);
          return {
            status: "saved",
            message: `Remembered ${candidate.path} (Java ${candidate.version}) as an environment-wide candidate. Projects match their own requirements.`,
            candidates: [candidate],
          };
        }
        if (request.operation === "forget") await jdkStore.forget(request.path);
        else
          await jdkStore.setProjectSelection({
            projectKey: workspaceKey,
            purpose: request.purpose,
            path: request.path,
          });
        return {
          status: "saved",
          message:
            request.operation === "forget"
              ? "JDK registration removed; installation files were not changed."
              : "Explicit project JDK selection saved; project import readiness is checked separately.",
        };
      } catch (error) {
        return {
          status: "failed",
          message: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
  const unavailable = (
    status: "unsupported" | "failed",
    message: string,
  ): CodeDevelopmentRuntime => {
    let closed = false;
    return {
      jdkStore,
      javaRuntimePort,
      port: {
        get enabled() {
          return !closed && activation.enabled;
        },
        refresh: () => activation.refresh(),
        query: async () => ({
          status,
          freshness: "unknown",
          scope: "workspace",
          languageId: "java",
          truncated: false,
          message,
        }),
        recordCommit: () => undefined,
        takeDiagnosticUpdates: () => [],
      },
      close: async () => {
        if (!closed) {
          closed = true;
          releasePolicy();
        }
      },
    };
  };
  try {
    await activation.refresh();
    const runtimeRoot = join(plugin.rootPath, "runtime");
    const manifest = JSON.parse(await readFile(join(runtimeRoot, "manifest.json"), "utf8")) as {
      version: number;
      supported: boolean;
      target: string;
      reason?: string;
    };
    const target = `${process.platform}-${process.arch}`;
    if (manifest.version !== 1 || manifest.target !== target) {
      throw new Error(`Code Development resources do not match execution target ${target}`);
    }
    if (!manifest.supported) {
      return unavailable("unsupported", manifest.reason ?? `Java is unavailable on ${target}`);
    }
    const key = JSON.stringify([input.cliStorageRoot, workspaceKey, plugin.rootPath]);
    let entry = owners.get(key);
    if (!entry) {
      entry = {
        users: 0,
        owner: createWorkspaceLanguageServiceOwner({
          workspaceRoot: input.workspaceRoot,
          workspaceKey,
          dataDir: join(
            input.cliStorageRoot,
            "code-development",
            "workspaces",
            createHash("sha256").update(workspaceKey).digest("hex"),
          ),
          resources: {
            javaExecutable: join(
              runtimeRoot,
              "java",
              "bin",
              process.platform === "win32" ? "java.exe" : "java",
            ),
            jdtlsRoot: join(runtimeRoot, "jdtls"),
            lombokJar: join(runtimeRoot, "lombok.jar"),
            extensionJar: join(plugin.rootPath, "dist", "java", "zcode-java-extension.jar"),
          },
          fileSystem: input.fileSystem,
          logger: input.logger,
          getProjectConfiguration: () => projectConfiguration(jdkStore, workspaceKey),
        }),
      };
      owners.set(key, entry);
    }
    entry.users += 1;
    const lease = entry.owner.acquire({ activation });
    let closed = false;
    return {
      port: lease.port,
      jdkStore,
      javaRuntimePort,
      close: async () => {
        if (closed) return;
        closed = true;
        try {
          await lease.release();
        } finally {
          releasePolicy();
          entry!.users -= 1;
          if (entry!.users === 0) {
            owners.delete(key);
            await entry!.owner.dispose();
          }
        }
      },
    };
  } catch (error) {
    // 语言资源缺失或损坏只影响此插件，不能阻断普通会话启动与其他基础工具。
    const message = error instanceof Error ? error.message : String(error);
    input.logger.warn("Code Development resources unavailable", { error: message });
    return unavailable("failed", message);
  }
}

async function projectConfiguration(
  store: JdkStore,
  projectKey: string,
): Promise<JavaProjectConfiguration> {
  const [discovery, config] = await Promise.all([store.discover(), store.getConfiguration()]);
  const selected = config.projectSelections[projectKey];
  for (const purpose of ["project", "build"] as const) {
    if (!selected?.[purpose]) continue;
    const selection = await store.select({ projectKey, purpose });
    if (selection.status !== "selected") throw new Error(selection.message);
    if (!discovery.candidates.some((candidate) => candidate.path === selection.jdk.path))
      discovery.candidates.push(selection.jdk);
  }
  const groups = new Map<number, typeof discovery.candidates>();
  for (const candidate of discovery.candidates) {
    const group = groups.get(candidate.major) ?? [];
    group.push(candidate);
    groups.set(candidate.major, group);
  }
  const runtimes: JavaProjectConfiguration["runtimes"] = [];
  const ambiguities: string[] = [];
  for (const [major, candidates] of groups) {
    const chosen =
      candidates.find((candidate) => candidate.path === selected?.project) ??
      (candidates.length === 1 ? candidates[0] : undefined);
    if (!chosen) {
      ambiguities.push(
        `Java ${major}: ${candidates.map((candidate) => candidate.path).join(", ")}`,
      );
      continue;
    }
    runtimes.push({
      name: major <= 8 ? `JavaSE-1.${major}` : `JavaSE-${major}`,
      path: chosen.path,
      ...(chosen.path === selected?.project ? { default: true } : {}),
    });
  }
  return {
    runtimes,
    candidatePaths: discovery.candidates.map((candidate) => candidate.path),
    projectJdkPath: selected?.project,
    gradleJavaHome: selected?.build,
    ambiguities,
  };
}
