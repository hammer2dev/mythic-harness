import { watch, type FSWatcher } from "node:fs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, dirname } from "node:path";
import type { ProviderConfigLayerSnapshot, ProviderSource } from "@zcode/provider";
import { decodeZCodeBuiltinRelease } from "./zcode-builtin-release.js";

export interface NodeZCodeBuiltinProviderConfigSourceOptions {
  readonly bundledFilePath: string;
  readonly watch?: boolean;
}

/** 内置模型只来自随应用发布的配置；个人配置由独立 Repository 管理。 */
export class NodeZCodeBuiltinProviderConfigSource implements ProviderSource<ProviderConfigLayerSnapshot> {
  readonly #filePath: string;
  readonly #watchEnabled: boolean;
  readonly #listeners = new Set<(reason: string) => void>();
  #watcher: FSWatcher | null = null;
  #disposed = false;

  constructor(options: NodeZCodeBuiltinProviderConfigSourceOptions) {
    this.#filePath = options.bundledFilePath;
    this.#watchEnabled = options.watch !== false;
  }

  async read(): Promise<ProviderConfigLayerSnapshot> {
    if (this.#disposed) throw new Error("Provider Config Source 已 dispose");
    const content = await readFile(this.#filePath, "utf8");
    const release = decodeZCodeBuiltinRelease(JSON.parse(content));
    if (this.#watchEnabled && !this.#watcher) {
      const target = basename(this.#filePath);
      this.#watcher = watch(dirname(this.#filePath), (_event, fileName) => {
        if (fileName === null || fileName.toString() === target) this.#emit("file-changed");
      });
      this.#watcher.on("error", () => this.#emit("watch-error"));
    }
    return Object.freeze({
      revision: "zcode-builtin:" + createHash("sha256").update(content).digest("hex"),
      providers: release.config.providers,
      providerTemplates: release.config.providerTemplates,
      models: release.config.modelConfigRules,
    });
  }

  onDidChange(listener: (reason: string) => void): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }
  dispose(): void {
    if (this.#disposed) return;
    this.#disposed = true;
    this.#watcher?.close();
    this.#listeners.clear();
  }
  #emit(reason: string): void {
    if (!this.#disposed) for (const listener of this.#listeners) listener(reason);
  }
}

export function createNodeZCodeBuiltinProviderConfigSource(
  options: NodeZCodeBuiltinProviderConfigSourceOptions,
): NodeZCodeBuiltinProviderConfigSource {
  return new NodeZCodeBuiltinProviderConfigSource(options);
}
