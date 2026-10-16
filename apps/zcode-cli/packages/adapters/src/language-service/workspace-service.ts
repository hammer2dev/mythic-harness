import { LanguageDocuments, hash, UnsupportedLanguageDocumentError } from "./documents.js";
import { JavaQueries, baseOutput, workspaceDiagnostics } from "./queries.js";
import { DiagnosticUpdates } from "./diagnostic-updates.js";
import { waitForLanguage } from "./jsonrpc.js";
import { LanguageCommitSynchronizer } from "./commits.js";
import { randomUUID } from "node:crypto";
import path from "node:path";
import type {
  FileSystemPort,
  LanguageFileCommit,
  LanguageServiceRequestOptions,
  Logger,
  LspInput,
  LspOutput,
  WorkspaceLanguageServicePort,
} from "@zcode/contracts";
import {
  JavaLanguageServer,
  onlyAddsJavaRuntimes,
  languageHover,
  languageLocations,
  languageSymbols,
  type JavaLanguageResources,
  type JavaProjectConfiguration,
} from "./java-server.js";

export interface LanguageServiceActivation {
  readonly enabled: boolean;
  refresh(): Promise<void>;
  onChange(listener: () => void): () => void;
}
export interface WorkspaceLanguageServiceOwnerOptions {
  workspaceRoot: string;
  workspaceKey: string;
  dataDir: string;
  resources: JavaLanguageResources;
  fileSystem: FileSystemPort;
  logger: Logger;
  getProjectConfiguration(): Promise<JavaProjectConfiguration>;
}
interface Lease {
  activation: LanguageServiceActivation;
  controller: AbortController;
  enabled: boolean;
  closed: boolean;
  updates: DiagnosticUpdates;
  unsubscribe(): void;
}
/** 一个执行 owner 持有共享服务；借用者只有资格、取消域和摘要投递状态。 */
export class WorkspaceLanguageServiceOwner {
  private readonly leases = new Set<Lease>();
  private readonly documents: LanguageDocuments;
  private readonly queries: JavaQueries;
  private readonly commits: LanguageCommitSynchronizer;
  private server?: JavaLanguageServer;
  private starting?: Promise<JavaLanguageServer>;
  private serverController = new AbortController();
  private epoch = 0;
  private configurationKey?: string;
  private configuration?: JavaProjectConfiguration;
  private stopped = false;

  constructor(private readonly options: WorkspaceLanguageServiceOwnerOptions) {
    this.documents = new LanguageDocuments(options);
    this.commits = new LanguageCommitSynchronizer(
      this.documents,
      () => ({
        server: this.server,
        starting: this.starting,
        epoch: this.epoch,
        signal: this.serverController.signal,
      }),
      options.logger,
    );
    this.queries = new JavaQueries({
      generation: () => this.documents.generation,
      epoch: () => this.epoch,
    });
  }

  acquire({ activation }: { activation: LanguageServiceActivation }): {
    port: WorkspaceLanguageServicePort;
    release(): Promise<void>;
  } {
    if (this.stopped) throw new Error("Workspace language owner is closed");
    const lease: Lease = {
      activation,
      controller: new AbortController(),
      enabled: activation.enabled,
      closed: false,
      updates: new DiagnosticUpdates(),
      unsubscribe: () => {},
    };
    const changed = () => {
      if (lease.enabled === activation.enabled || lease.closed) return;
      lease.enabled = activation.enabled;
      if (!lease.enabled) {
        lease.controller.abort(new Error("Code development plugin disabled"));
        lease.updates.clear();
        void this.stopIfUnused();
      } else lease.controller = new AbortController();
    };
    lease.unsubscribe = activation.onChange(changed);
    this.leases.add(lease);
    const refresh = async () => {
      await activation.refresh();
      changed();
    };
    return {
      port: {
        get enabled() {
          return !lease.closed && activation.enabled;
        },
        refresh,
        query: async (input, options) => {
          await refresh();
          return this.query(lease, input, options);
        },
        recordCommit: (change) => this.recordCommit(lease, change),
        takeDiagnosticUpdates: (sessionId, turnId) => lease.updates.take(sessionId, turnId),
        awaitPendingDiagnostics: (sessionId, turnId, options) =>
          lease.updates.wait(sessionId, turnId, options),
      },
      release: async () => {
        if (lease.closed) return;
        lease.closed = true;
        lease.unsubscribe();
        lease.controller.abort(new Error("Language service lease released"));
        lease.updates.clear();
        this.leases.delete(lease);
        await this.stopIfUnused();
      },
    };
  }

  private async stopIfUnused(): Promise<void> {
    if (![...this.leases].some((lease) => lease.enabled && !lease.closed)) await this.stopServer();
  }
  private async stopServer(): Promise<void> {
    this.epoch++;
    this.serverController.abort(new Error("Language server stopped"));
    this.documents.stopWatching();
    const server = this.server;
    this.server = undefined;
    this.starting = undefined;
    this.configurationKey = undefined;
    await server?.close();
  }
  async dispose(): Promise<void> {
    this.stopped = true;
    for (const lease of this.leases) {
      lease.closed = true;
      lease.unsubscribe();
      lease.controller.abort();
      lease.updates.clear();
    }
    this.leases.clear();
    await this.stopServer();
  }

  private async ensureServer(configuration: JavaProjectConfiguration): Promise<JavaLanguageServer> {
    const key = JSON.stringify(configuration);
    if (this.configurationKey && this.configurationKey !== key) {
      if (onlyAddsJavaRuntimes(this.configuration, configuration)) {
        if (this.starting) await this.starting;
        this.server?.updateConfiguration(configuration);
        this.documents.generation++;
        this.configurationKey = key;
        this.configuration = configuration;
      } else await this.stopServer();
    }
    if (this.starting) return this.starting;
    if (this.server) return this.server;
    if (this.stopped || ![...this.leases].some((lease) => lease.enabled && !lease.closed))
      throw new Error("Workspace language owner has no active lease");
    this.configurationKey = key;
    this.configuration = configuration;
    this.serverController = new AbortController();
    const epoch = ++this.epoch;
    const server = new JavaLanguageServer({
      ...this.options,
      configuration,
      runDirectory: path.join(
        this.options.dataDir,
        "language-services",
        hash(this.options.workspaceKey).slice(0, 24),
        randomUUID(),
      ),
      onExit: (error) => {
        if (this.server === server) {
          this.server = undefined;
          this.epoch++;
          this.documents.generation++;
          this.options.logger.warn("Java language server stopped", { error: error.message });
        }
      },
      onInvalidation: () => {
        this.documents.generation++;
      },
    });
    this.server = server;
    const start = server
      .start(AbortSignal.any([this.serverController.signal, AbortSignal.timeout(120000)]))
      .then(() => {
        if (epoch !== this.epoch) throw new Error("Language startup was superseded");
        this.documents.watchWorkspace(server);
        return server;
      })
      .catch(async (error: unknown) => {
        if (this.server === server) this.server = undefined;
        await server.close();
        throw error;
      })
      .finally(() => {
        if (this.starting === start) this.starting = undefined;
      });
    this.starting = start;
    return start;
  }

  private async query(
    lease: Lease,
    input: LspInput,
    options: LanguageServiceRequestOptions = {},
  ): Promise<LspOutput> {
    if (!lease.enabled || lease.closed)
      return baseOutput(input, "disabled", "Code development plugin is disabled");
    const signal = AbortSignal.any([
      lease.controller.signal,
      ...(options.signal ? [options.signal] : []),
      AbortSignal.timeout(120000),
    ]);
    try {
      signal.throwIfAborted();
      if (input.operation === "diagnostics" && !input.file_path)
        return await workspaceDiagnostics(
          {
            fileSystem: this.options.fileSystem,
            workspaceRoot: this.options.workspaceRoot,
            query: (input, options) => this.query(lease, input, options),
          },
          input,
          { ...options, signal },
        );
      const file = input.file_path ? this.documents.pathFor(input.file_path) : undefined;
      let document = file ? await this.documents.read(file, { ...options, signal }) : undefined;
      const configuration = await this.options.getProjectConfiguration();
      signal.throwIfAborted();
      const server = await waitForLanguage(this.ensureServer(configuration), signal);
      signal.throwIfAborted();
      await waitForLanguage(this.commits.barrier(), signal);
      if (document) document = this.documents.sync(server, document, this.epoch);
      if (document) {
        const problem = await this.queries.projectProblem(
          server,
          document.uri,
          configuration,
          signal,
        );
        if (problem) return baseOutput(input, "needs_configuration", problem);
      }
      const limit = input.limit ?? 50;
      await waitForLanguage(this.commits.barrier(), signal);
      await this.documents.refreshOpen(server, this.epoch, { ...options, signal });
      if (document) document = this.documents.get(document.path) ?? document;
      let result: LspOutput;
      if (input.operation === "diagnostics") {
        result = await this.queries.diagnostics(server, document!, signal, limit);
      } else {
        const capabilities = {
          definition: "definitionProvider",
          references: "referencesProvider",
          implementation: "implementationProvider",
          hover: "hoverProvider",
          documentSymbols: "documentSymbolProvider",
          workspaceSymbols: "workspaceSymbolProvider",
        } as const;
        if (!server.supports(capabilities[input.operation]))
          return baseOutput(
            input,
            "unsupported",
            "Language server does not support this operation",
          );
        if (!document && input.operation !== "workspaceSymbols")
          return baseOutput(input, "failed", "file_path is required");
        const position =
          input.line && input.column
            ? { line: input.line - 1, character: input.column - 1 }
            : undefined;
        if (!["documentSymbols", "workspaceSymbols"].includes(input.operation) && !position)
          return baseOutput(input, "failed", "line and column are required");
        const methods = {
          definition: "textDocument/definition",
          references: "textDocument/references",
          implementation: "textDocument/implementation",
          hover: "textDocument/hover",
          documentSymbols: "textDocument/documentSymbol",
          workspaceSymbols: "workspace/symbol",
        } as const;
        const generation = this.documents.generation;
        const epoch = this.epoch;
        const value = await server.request(
          methods[input.operation],
          input.operation === "workspaceSymbols"
            ? { query: input.query ?? "" }
            : {
                textDocument: { uri: document!.uri },
                ...(position ? { position } : {}),
                ...(input.operation === "references"
                  ? { context: { includeDeclaration: true } }
                  : {}),
              },
          signal,
        );
        result = {
          ...baseOutput(input, "ready"),
          fileRevision: document?.revision,
          documentVersion: document?.version,
          contentHash: document?.hash,
        };
        if (input.operation === "hover") {
          const text = languageHover(value);
          result.hover = text.slice(0, 16000);
          result.truncated = text.length > 16000;
        } else if (
          input.operation === "documentSymbols" ||
          input.operation === "workspaceSymbols"
        ) {
          const values = languageSymbols(value, document?.uri);
          result.symbols = values.slice(0, limit);
          result.truncated = values.length > limit;
        } else {
          const values = languageLocations(value);
          result.locations = values.slice(0, limit);
          result.truncated = values.length > limit;
        }
        if (epoch !== this.epoch || generation !== this.documents.generation)
          result.freshness = "stale";
      }
      if (document) {
        const latest = await this.documents.read(document.path, { ...options, signal });
        if (latest.hash !== document.hash) result.freshness = "stale";
        else result.fileRevision = latest.revision;
      }
      signal.throwIfAborted();
      return result;
    } catch (error) {
      if (!lease.enabled || lease.closed)
        return baseOutput(input, "disabled", "Code development plugin was disabled");
      if (options.signal?.aborted) throw options.signal.reason;
      if (error instanceof UnsupportedLanguageDocumentError)
        return baseOutput(input, "unsupported", error.message);
      return baseOutput(input, "failed", error instanceof Error ? error.message : String(error));
    }
  }

  private recordCommit(lease: Lease, change: LanguageFileCommit): void {
    if (this.stopped || path.extname(change.path).toLowerCase() !== ".java") return;
    let commit: { file: string; sequence: number };
    try {
      commit = this.commits.register(change);
    } catch {
      return;
    }
    if (!lease.enabled || lease.closed || change.analyze === false || change.content === null)
      return;
    const session = change.trace?.sessionId;
    const turn = change.trace?.turnId;
    if (session && turn)
      lease.updates.begin(
        session,
        turn,
        baseOutput(
          { operation: "diagnostics", file_path: commit.file },
          "pending",
          "Java diagnostics are pending for this committed revision",
        ),
      );
    const task = lease.activation
      .refresh()
      .then(async () => {
        if (!lease.activation.enabled || lease.closed) return;
        const result = await this.query(
          lease,
          { operation: "diagnostics", file_path: commit.file },
          { trace: change.trace },
        );
        // 旧提交完成后不能投递到后来的文件版本，也不能跨 turn 恢复为新任务。
        if (
          !session ||
          !turn ||
          !lease.enabled ||
          lease.closed ||
          !this.commits.current(commit.file, commit.sequence)
        )
          return;
        lease.updates.complete(session, turn, result);
      })
      .catch((error: unknown) =>
        this.options.logger.warn("Automatic Java diagnostics failed", { error: String(error) }),
      );
    if (session && turn) lease.updates.track(session, turn, task);
  }
}

export function createWorkspaceLanguageServiceOwner(
  options: WorkspaceLanguageServiceOwnerOptions,
): WorkspaceLanguageServiceOwner {
  return new WorkspaceLanguageServiceOwner(options);
}
