import { watch, type FSWatcher } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, relative, resolve, sep } from "node:path";
import { ConfigScope, type RuntimeConfigPatch } from "@zcode/contracts";
import { discoverWorkspaceHookConfigPathsAsync } from "@zcode/shared/workspace-hook-discovery";
import {
  createPrioritizedConfig,
  getDefaultConfigPath,
  mergeConfigs,
  parseConfigFileToRuntimePatchWithDiagnostics,
} from "../config/index.js";

export const CODE_DEVELOPMENT_PLUGIN_ID = "code-development@zcode-plugins-official";

export interface CodeDevelopmentPluginPolicy {
  readonly enabled: boolean;
  refresh(): Promise<void>;
  onChange(listener: () => void): () => void;
  close(): void;
}

export interface CodeDevelopmentPluginPolicyOptions {
  workingDirectory: string;
  projectConfigPath?: string;
  skipUserConfig?: boolean;
  /** 仅由受信宿主传入的 CLI/runtime 显式覆盖；不能覆盖卸载抑制。 */
  enabledOverride?: boolean;
}

interface PolicyEntry {
  options: CodeDevelopmentPluginPolicyOptions;
  enabled: boolean;
  listeners: Set<() => void>;
  leases: number;
  tail: Promise<void>;
  watchTargets: Map<string, Set<string>>;
}

interface DirectoryWatch {
  watcher: FSWatcher;
  entries: Set<PolicyEntry>;
}

/** 每个执行进程一个 owner；目录通知与调用前核验共用 refresh，配置文件是持久事实源。 */
export class CodeDevelopmentPluginPolicyOwner {
  private readonly entries = new Map<string, PolicyEntry>();
  private readonly watches = new Map<string, DirectoryWatch>();
  private readonly userConfigPath: string;
  private closed = false;

  constructor(
    private readonly options: {
      userConfigPath?: string;
      onError?: (error: unknown) => void;
    } = {},
  ) {
    this.userConfigPath = resolve(options.userConfigPath ?? getDefaultConfigPath());
  }

  acquire(options: CodeDevelopmentPluginPolicyOptions): CodeDevelopmentPluginPolicy {
    if (this.closed) throw new Error("Plugin policy owner is closed");
    const normalized = {
      ...options,
      workingDirectory: resolve(options.workingDirectory),
      ...(options.projectConfigPath
        ? { projectConfigPath: resolve(options.projectConfigPath) }
        : {}),
    };
    const key = JSON.stringify(normalized);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = {
        options: normalized,
        enabled: false,
        listeners: new Set(),
        leases: 0,
        tail: Promise.resolve(),
        watchTargets: new Map(),
      };
      this.entries.set(key, entry);
    }
    const target = entry;
    target.leases += 1;
    let released = false;
    const listeners = new Set<() => void>();
    return {
      get enabled() {
        return !released && target.enabled;
      },
      refresh: () =>
        released
          ? Promise.reject(new Error("Plugin policy lease is closed"))
          : this.refresh(target),
      onChange: (listener) => {
        if (released) throw new Error("Plugin policy lease is closed");
        target.listeners.add(listener);
        listeners.add(listener);
        return () => {
          target.listeners.delete(listener);
          listeners.delete(listener);
        };
      },
      close: () => {
        if (released) return;
        released = true;
        for (const listener of listeners) target.listeners.delete(listener);
        listeners.clear();
        target.leases -= 1;
        if (target.leases === 0) {
          this.entries.delete(key);
          this.unwatch(target);
        }
      },
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const entry of this.entries.values()) this.publish(entry, false);
    for (const { watcher } of this.watches.values()) watcher.close();
    this.watches.clear();
    this.entries.clear();
  }

  private refresh(entry: PolicyEntry): Promise<void> {
    const work = entry.tail.then(async () => {
      if (this.closed || entry.leases === 0) return;
      try {
        const refs = await discoverWorkspaceHookConfigPathsAsync({
          workingDirectory: entry.options.workingDirectory,
          explicitProjectConfigPath: entry.options.projectConfigPath,
          includeMissing: true,
        });
        const paths = refs.map((ref) => ref.path);
        if (!entry.options.skipUserConfig) paths.unshift(this.userConfigPath);
        // 先监听再读取，避免读取与安装监听之间漏掉保存；首次创建也监听最近的现有父目录。
        await this.updateWatches(entry, paths);
        const configs = await Promise.all(paths.map(readPluginConfig));
        const userConfig = entry.options.skipUserConfig ? {} : (configs.shift() ?? {});
        const merged = mergeConfigs(
          createPrioritizedConfig(userConfig, ConfigScope.User),
          ...configs.map((config) => createPrioritizedConfig(config, ConfigScope.Project)),
        );
        // 卸载是环境 inventory 的事实，项目的 enabled:true 不能复活被卸载的内置插件。
        const suppressed = userConfig.plugins?.suppressedBuiltins?.includes(
          CODE_DEVELOPMENT_PLUGIN_ID,
        );
        const enabled =
          !suppressed &&
          (entry.options.enabledOverride ??
            merged.plugins?.enabledPlugins?.[CODE_DEVELOPMENT_PLUGIN_ID] ??
            true);
        if (!this.closed && entry.leases > 0) this.publish(entry, enabled);
      } catch (error) {
        // 坏配置不能按“没有配置”回退默认启用；调用前检查将错误交给调用方处理。
        this.publish(entry, false);
        throw error;
      }
    });
    entry.tail = work.catch(() => undefined);
    return work;
  }

  private publish(entry: PolicyEntry, enabled: boolean): void {
    if (entry.enabled === enabled) return;
    entry.enabled = enabled;
    for (const listener of entry.listeners) listener();
  }

  private async updateWatches(entry: PolicyEntry, files: string[]): Promise<void> {
    const targets = new Map<string, Set<string>>();
    for (const file of files) {
      const directory = await nearestExistingDirectory(dirname(file));
      const names = targets.get(directory) ?? new Set<string>();
      names.add(relative(directory, file).split(sep)[0] ?? basename(file));
      targets.set(directory, names);
    }
    if (this.closed || entry.leases === 0) return;
    for (const directory of targets.keys()) {
      let watched = this.watches.get(directory);
      if (!watched) {
        const watcher = watch(directory, { persistent: false }, (_event, filename) => {
          const current = this.watches.get(directory);
          for (const target of current?.entries ?? []) {
            if (filename !== null && !target.watchTargets.get(directory)?.has(filename.toString()))
              continue;
            void this.refresh(target).catch((error) => this.options.onError?.(error));
          }
        });
        watched = { watcher, entries: new Set() };
        this.watches.set(directory, watched);
        watcher.on("error", (error) => {
          watcher.close();
          this.watches.delete(directory);
          this.options.onError?.(error);
        });
      }
      watched.entries.add(entry);
    }
    for (const directory of entry.watchTargets.keys()) {
      if (!targets.has(directory)) this.removeWatchEntry(directory, entry);
    }
    entry.watchTargets = targets;
  }

  private unwatch(entry: PolicyEntry): void {
    for (const directory of entry.watchTargets.keys()) this.removeWatchEntry(directory, entry);
    entry.watchTargets.clear();
  }

  private removeWatchEntry(directory: string, entry: PolicyEntry): void {
    const watched = this.watches.get(directory);
    watched?.entries.delete(entry);
    if (watched?.entries.size === 0) {
      watched.watcher.close();
      this.watches.delete(directory);
    }
  }
}

async function readPluginConfig(path: string): Promise<RuntimeConfigPatch> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
  return parseConfigFileToRuntimePatchWithDiagnostics(JSON.parse(text)).config;
}

async function nearestExistingDirectory(path: string): Promise<string> {
  let current = path;
  while (true) {
    try {
      if ((await stat(current)).isDirectory()) return current;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    const parent = dirname(current);
    if (parent === current) throw new Error(`Config watch directory unavailable: ${path}`);
    current = parent;
  }
}
