import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, readdir, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { atomicWritePrivateTextFile, withFileLock } from "@zcode/shared/node";
import { z } from "zod";

const runFile = promisify(execFile);
const JdkConfigSchema = z
  .object({
    version: z.literal(1),
    candidates: z.array(z.string().min(1)),
    projectSelections: z.record(
      z.string(),
      z
        .object({
          project: z.string().min(1).optional(),
          build: z.string().min(1).optional(),
        })
        .strict(),
    ),
  })
  .strict();
type JdkConfig = z.infer<typeof JdkConfigSchema>;

export interface JdkConfiguration {
  readonly version: 1;
  readonly candidates: readonly string[];
  readonly projectSelections: Readonly<
    Record<string, Readonly<{ project?: string; build?: string }>>
  >;
}

export interface JdkCandidate {
  path: string;
  version: string;
  major: number;
  vendor?: string;
  sources: string[];
}

export interface JdkDiscovery {
  revision: string;
  candidates: JdkCandidate[];
  issues: Array<{ path: string; message: string }>;
}

export interface JdkSelectionInput {
  /** 仅明确的 toolchain/JDK 要求传 major；source/target/release 不是精确 JDK 要求。 */
  major?: number;
  minimumMajor?: number;
  projectKey?: string;
  purpose?: "project" | "build";
}

export type JdkSelection =
  | { status: "selected"; jdk: JdkCandidate; revision: string }
  | {
      status: "missing" | "ambiguous";
      candidates: JdkCandidate[];
      message: string;
      revision: string;
    };

export interface JdkStoreOptions {
  /** 执行环境用户数据目录中的文件；不得放入随版本替换的插件缓存。 */
  filePath: string;
  env?: NodeJS.ProcessEnv;
  homeDirectory?: string;
  /** 可注入安装根供嵌入式宿主/验证使用；未给出时读取当前平台常见安装目录。 */
  installationRoots?: string[];
}

/** 只接受宿主已经确认的配置意图；不从模型文本推断授权或修改全局环境变量。 */
export class JdkStore {
  private readonly filePath: string;
  private readonly env: NodeJS.ProcessEnv;
  private readonly homeDirectory: string;

  constructor(private readonly options: JdkStoreOptions) {
    this.filePath = resolve(options.filePath);
    this.env = options.env ?? process.env;
    this.homeDirectory = options.homeDirectory ?? homedir();
  }

  async discover(): Promise<JdkDiscovery> {
    return this.discoverFrom(await this.read());
  }

  /** 每次读取返回独立快照，显式项目选择与自动匹配结果保持分开。 */
  getConfiguration(): Promise<JdkConfiguration> {
    return this.read();
  }

  async forget(path: string): Promise<void> {
    let canonical = this.expandPath(path);
    try {
      canonical = await realpath(canonical);
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
    await this.update((config) => {
      const binding = Object.entries(config.projectSelections).find(([, selection]) =>
        Object.values(selection).some((selected) => selected && samePath(selected, canonical)),
      );
      if (binding) {
        throw new Error(
          `JDK is explicitly selected by project ${binding[0]}; clear that selection first.`,
        );
      }
      config.candidates = config.candidates.filter((entry) => !samePath(entry, canonical));
    });
  }

  async register(path: string): Promise<JdkCandidate> {
    const candidate = await inspectJdk(this.expandPath(path), ["registered"]);
    await this.update((config) => {
      if (!config.candidates.some((entry) => samePath(entry, candidate.path))) {
        config.candidates.push(candidate.path);
      }
    });
    return candidate;
  }

  async setProjectSelection(input: {
    projectKey: string;
    purpose?: "project" | "build";
    /** 未指定 path 表示清除此项明确选择，重新自动匹配。 */
    path?: string;
  }): Promise<void> {
    if (!input.projectKey.trim()) throw new Error("Project selection requires a project key");
    const candidate = input.path
      ? await inspectJdk(this.expandPath(input.path), ["selected"])
      : undefined;
    await this.update((config) => {
      const selection = { ...config.projectSelections[input.projectKey] };
      const purpose = input.purpose ?? "project";
      if (candidate) selection[purpose] = candidate.path;
      else delete selection[purpose];
      if (Object.keys(selection).length) config.projectSelections[input.projectKey] = selection;
      else delete config.projectSelections[input.projectKey];
    });
  }

  async select(input: JdkSelectionInput = {}): Promise<JdkSelection> {
    const config = await this.read();
    const selectedPath = input.projectKey
      ? config.projectSelections[input.projectKey]?.[input.purpose ?? "project"]
      : undefined;
    const discovery = await this.discoverFrom(config, selectedPath);
    const candidates = discovery.candidates.filter(
      (candidate) =>
        (input.major === undefined || candidate.major === input.major) &&
        (input.minimumMajor === undefined || candidate.major >= input.minimumMajor) &&
        (!selectedPath || samePath(candidate.path, selectedPath)),
    );
    if (candidates.length === 1) {
      return { status: "selected", jdk: candidates[0]!, revision: discovery.revision };
    }
    return {
      status: candidates.length ? "ambiguous" : "missing",
      candidates,
      revision: discovery.revision,
      message: candidates.length
        ? "Multiple matching JDKs are available; ask the user which path to select."
        : selectedPath
          ? `The explicitly selected JDK is unavailable or incompatible: ${selectedPath}`
          : "No compatible project JDK was found; ask the user to install one or provide its path.",
    };
  }

  private async discoverFrom(config: JdkConfig, selectedPath?: string): Promise<JdkDiscovery> {
    const paths = new Map<string, { path: string; sources: Set<string> }>();
    const issues: JdkDiscovery["issues"] = [];
    const add = async (path: string, source: string) => {
      try {
        const canonical = await realpath(this.expandPath(path));
        const key = pathKey(canonical);
        const entry = paths.get(key) ?? { path: canonical, sources: new Set<string>() };
        entry.sources.add(source);
        paths.set(key, entry);
      } catch (error) {
        if (source !== "system") issues.push({ path, message: errorMessage(error) });
      }
    };
    for (const path of config.candidates) await add(path, "registered");
    // 明确项目选择只参与当前项目，不能意外成为其它项目的新自动候选并制造歧义。
    if (selectedPath) await add(selectedPath, "selected");
    if (this.env.JAVA_HOME) await add(this.env.JAVA_HOME, "JAVA_HOME");
    const pathValue = Object.entries(this.env).find(([key]) => key.toUpperCase() === "PATH")?.[1];
    for (const directory of (pathValue ?? "").split(delimiter).filter(Boolean)) {
      try {
        const binary = await realpath(join(unquote(directory), javaExecutable()));
        await add(dirname(dirname(binary)), "PATH");
      } catch (error) {
        if (!isMissing(error)) issues.push({ path: directory, message: errorMessage(error) });
      }
    }
    const roots = this.options.installationRoots ?? installationRoots(this.env, this.homeDirectory);
    for (const root of roots) {
      try {
        // 安装根可能本身就是一个 JDK（如 SDKMAN current）。仅检测一层子目录，不扫描磁盘。
        await addIfJdkHome(root, add);
        for (const entry of await readdir(root, { withFileTypes: true })) {
          if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
          const path = join(root, entry.name);
          await addIfJdkHome(path, add);
          if (process.platform === "darwin")
            await addIfJdkHome(join(path, "Contents", "Home"), add);
        }
      } catch (error) {
        if (!isMissing(error)) issues.push({ path: root, message: errorMessage(error) });
      }
    }
    const inspected = await Promise.all(
      [...paths.values()].map(async ({ path, sources }) => {
        try {
          return await inspectJdk(path, [...sources]);
        } catch (error) {
          issues.push({ path, message: errorMessage(error) });
          return undefined;
        }
      }),
    );
    const candidates = inspected
      .filter((candidate): candidate is JdkCandidate => candidate !== undefined)
      .sort((a, b) => a.path.localeCompare(b.path));
    return {
      candidates,
      issues,
      revision: createHash("sha256")
        .update(JSON.stringify({ registered: config.candidates, selectedPath, candidates }))
        .digest("hex"),
    };
  }

  private async read(): Promise<JdkConfig> {
    try {
      return JdkConfigSchema.parse(JSON.parse(await readFile(this.filePath, "utf8")));
    } catch (error) {
      if (isMissing(error)) return { version: 1, candidates: [], projectSelections: {} };
      // 无效用户配置必须保留，不能当作空配置再保存而覆盖明确选择。
      throw new Error(`Unable to read JDK configuration: ${this.filePath}`, { cause: error });
    }
  }

  private update(transform: (config: JdkConfig) => void): Promise<void> {
    return withFileLock(this.filePath, async () => {
      const config = await this.read();
      transform(config);
      await atomicWritePrivateTextFile(this.filePath, JSON.stringify(config, null, 2) + "\n");
    });
  }

  private expandPath(path: string): string {
    const normalized = unquote(path.trim());
    if (!normalized) throw new Error("JDK path is empty");
    return normalized === "~"
      ? this.homeDirectory
      : normalized.startsWith("~/") || normalized.startsWith("~\\")
        ? join(this.homeDirectory, normalized.slice(2))
        : resolve(normalized);
  }
}

export async function inspectJdk(path: string, sources: string[] = []): Promise<JdkCandidate> {
  const canonical = await realpath(path);
  const release = await readFile(join(canonical, "release"), "utf8");
  const releaseVersion = /^JAVA_VERSION="([^"]+)"/m.exec(release)?.[1];
  if (!releaseVersion) throw new Error(`JDK release has no JAVA_VERSION: ${canonical}`);
  const binary = join(canonical, "bin", javaExecutable());
  await access(join(canonical, "bin", process.platform === "win32" ? "javac.exe" : "javac"));
  const { stdout, stderr } = await runFile(binary, ["-XshowSettings:properties", "-version"], {
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 256 * 1024,
    encoding: "utf8",
  });
  const actualVersion = /^\s*java\.version\s*=\s*(\S+)/m.exec(`${stdout}\n${stderr}`)?.[1];
  const major = javaMajor(actualVersion ?? "");
  if (!actualVersion || !major || releaseVersion.split("+")[0] !== actualVersion.split("+")[0]) {
    throw new Error(`JDK release and executable versions do not match: ${canonical}`);
  }
  const vendor = /^IMPLEMENTOR="([^"]+)"/m.exec(release)?.[1];
  return { path: canonical, version: actualVersion, major, ...(vendor ? { vendor } : {}), sources };
}

function javaMajor(version: string): number | undefined {
  const match = /^(?:1\.)?(\d+)(?:[._+-]|$)/.exec(version);
  return match ? Number(match[1]) : undefined;
}

function javaExecutable(): string {
  return process.platform === "win32" ? "java.exe" : "java";
}
function unquote(value: string): string {
  return value.replace(/^"(.*)"$/, "$1");
}
function pathKey(path: string): string {
  return process.platform === "win32" ? path.toLowerCase() : path;
}
function samePath(first: string, second: string): boolean {
  return pathKey(first) === pathKey(second);
}
function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === "ENOENT";
}
function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function addIfJdkHome(
  path: string,
  add: (path: string, source: string) => Promise<void>,
): Promise<void> {
  try {
    await access(join(path, "release"));
    await add(path, "system");
  } catch (error) {
    if (!isMissing(error)) throw error;
  }
}

function installationRoots(env: NodeJS.ProcessEnv, home: string): string[] {
  if (process.platform === "win32") {
    const programFiles = env.ProgramFiles ?? env.PROGRAMFILES ?? "C:\\Program Files";
    return ["Java", "Eclipse Adoptium", "Microsoft", "Zulu", "BellSoft", "Amazon Corretto"]
      .map((directory) => join(programFiles, directory))
      .concat(join(home, ".jdks"), join(home, "scoop", "apps"));
  }
  return (
    process.platform === "darwin"
      ? ["/Library/Java/JavaVirtualMachines", join(home, "Library", "Java", "JavaVirtualMachines")]
      : ["/usr/lib/jvm", "/usr/java", "/opt/java"]
  ).concat(join(home, ".jdks"), join(home, ".sdkman", "candidates", "java"));
}
