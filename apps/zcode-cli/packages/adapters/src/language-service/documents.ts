import { createHash } from "node:crypto";
import { watch, type FSWatcher } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { FileSystemPort, LanguageServiceRequestOptions, Logger } from "@zcode/contracts";
import type { JavaLanguageServer } from "./java-server.js";
import { waitForLanguage } from "./jsonrpc.js";
export class UnsupportedLanguageDocumentError extends Error {}
export const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
export const canonical = (value: string) =>
  process.platform === "win32" ? path.resolve(value).toLowerCase() : path.resolve(value);
export interface DocumentState {
  path: string;
  uri: string;
  content: string | null;
  hash: string;
  revision?: string;
  version: number;
  epoch?: number;
  lastOpenedEpoch?: number;
  syncedVersion?: number;
}

export class LanguageDocuments {
  private readonly items = new Map<string, DocumentState>();
  private readonly reads = new Map<string, Promise<DocumentState>>();
  private watcher?: FSWatcher;
  private activeServer?: JavaLanguageServer;
  generation = 0;
  constructor(
    private readonly options: { workspaceRoot: string; fileSystem: FileSystemPort; logger: Logger },
  ) {}
  get(file: string): DocumentState | undefined {
    return this.items.get(canonical(file));
  }
  stopWatching(): void {
    this.watcher?.close();
    this.watcher = undefined;
    this.activeServer = undefined;
  }
  watchWorkspace(server: JavaLanguageServer): void {
    this.activeServer = server;
    this.watcher = watch(this.options.workspaceRoot, { recursive: true }, (_event, filename) => {
      if (
        !filename ||
        !/(\.java|pom\.xml|\.gradle(?:\.kts)?|gradle\.properties|\.classpath|\.project)$/.test(
          filename.toString(),
        )
      )
        return;
      const file = path.resolve(this.options.workspaceRoot, filename.toString());
      this.generation++;
      void stat(file)
        .then(
          () => 2,
          () => 3,
        )
        .then((type) => {
          if (this.activeServer === server)
            server.notify("workspace/didChangeWatchedFiles", {
              changes: [{ uri: pathToFileURL(file).href, type }],
            });
        })
        .catch((error: unknown) =>
          this.options.logger.debug("Language file notification skipped", { error: String(error) }),
        );
    });
    this.watcher.on("error", (error) => {
      this.generation++;
      this.options.logger.warn("Language workspace watcher failed", { error: error.message });
    });
  }

  pathFor(file: string): string {
    const resolved = path.resolve(this.options.workspaceRoot, file);
    const relative = path.relative(this.options.workspaceRoot, resolved);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      throw new Error("Language request must remain inside the workspace");
    if (path.extname(resolved).toLowerCase() !== ".java")
      throw new Error("No language provider for this file");
    return resolved;
  }
  record(file: string, content: string | null, revision?: string): DocumentState {
    const key = canonical(file);
    const prior = this.items.get(key);
    const contentHash = content === null ? "" : hash(content);
    if (prior && prior.hash === contentHash && prior.content === content) {
      prior.revision = revision;
      return prior;
    }
    this.generation++;
    const doc = {
      ...prior,
      path: file,
      uri: pathToFileURL(file).href,
      content,
      hash: contentHash,
      revision,
      version: (prior?.version ?? 0) + 1,
    };
    this.items.set(key, doc);
    return doc;
  }
  read(file: string, options?: LanguageServiceRequestOptions): Promise<DocumentState> {
    const key = canonical(file);
    // 串行同文档读取，防止较早的读取迟到后覆盖已提交版本的镜像。
    const pending = (this.reads.get(key) ?? Promise.resolve())
      .catch(() => {})
      .then(() => {
        options?.signal?.throwIfAborted();
        return this.readCurrent(file, options);
      });
    this.reads.set(key, pending);
    void pending
      .finally(() => {
        if (this.reads.get(key) === pending) this.reads.delete(key);
      })
      .catch(() => {});
    return options?.signal ? waitForLanguage(pending, options.signal) : pending;
  }
  private async readCurrent(
    file: string,
    options?: LanguageServiceRequestOptions,
  ): Promise<DocumentState> {
    const result = await this.options.fileSystem.readTextFile(
      { path: file, maxBytes: 2 * 1024 * 1024, trace: options?.trace, preserveLineEndings: true },
      { signal: options?.signal },
    );
    // JDT didSave 会从磁盘重载；同步必须保留真实 CRLF，不能使用工具层归一化后的 LF。
    if (result.lineEndingsPreserved !== true)
      throw new UnsupportedLanguageDocumentError(
        "File system adapter cannot preserve the source text for reliable language synchronization.",
      );
    if (result.truncated) throw new Error("Language service requires complete file content");
    return this.record(file, result.content, result.revision?.id);
  }
  async refreshOpen(
    server: JavaLanguageServer,
    epoch: number,
    options: LanguageServiceRequestOptions,
  ): Promise<void> {
    // watcher 通知不能刷新 JDT 已打开的 buffer；跨文件查询前直接核验这些文档，避免依赖旧内容。
    const opened = [...this.items.values()].filter(
      (document) => document.lastOpenedEpoch === epoch,
    );
    for (const previous of opened) {
      let document: DocumentState;
      try {
        document = await this.read(previous.path, options);
      } catch (error) {
        if (!error || typeof error !== "object" || !("code" in error) || error.code !== "not_found")
          throw error;
        document = this.record(previous.path, null);
      }
      this.sync(server, document, epoch);
    }
  }
  sync(server: JavaLanguageServer, document: DocumentState, epoch: number): DocumentState {
    // 初始化期间可能已有新提交；旧查询不得把低版本重新发送给共享服务。
    document = this.items.get(canonical(document.path)) ?? document;
    const opened = document.epoch === epoch;
    if (document.content === null) {
      if (opened) server.notify("textDocument/didClose", { textDocument: { uri: document.uri } });
      if (opened || document.syncedVersion !== document.version)
        server.notify("workspace/didChangeWatchedFiles", {
          changes: [{ uri: document.uri, type: 3 }],
        });
      document.epoch = undefined;
      document.syncedVersion = document.version;
      return document;
    }
    if (!opened)
      server.notify("textDocument/didOpen", {
        textDocument: {
          uri: document.uri,
          languageId: "java",
          version: document.version,
          text: document.content,
        },
      });
    else if (document.syncedVersion !== document.version)
      server.notify("textDocument/didChange", {
        textDocument: { uri: document.uri, version: document.version },
        contentChanges: [{ text: document.content }],
      });
    if (!opened || document.syncedVersion !== document.version)
      server.notify("textDocument/didSave", { textDocument: { uri: document.uri } });
    document.epoch = epoch;
    document.lastOpenedEpoch = epoch;
    document.syncedVersion = document.version;
    return document;
  }
}
