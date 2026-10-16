import { access, mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type {
  Logger,
  LanguageDiagnostic,
  LanguageLocation,
  LanguageSymbol,
} from "@zcode/contracts";
import { StdioJsonRpc } from "./jsonrpc.js";

export interface JavaLanguageResources {
  javaExecutable: string;
  jdtlsRoot: string;
  lombokJar: string;
  extensionJar: string;
}

export interface JavaProjectConfiguration {
  runtimes: Array<{ name: string; path: string; default?: boolean }>;
  candidatePaths: string[];
  projectJdkPath?: string;
  gradleJavaHome?: string;
  ambiguities?: string[];
}

export function onlyAddsJavaRuntimes(
  previous: JavaProjectConfiguration | undefined,
  next: JavaProjectConfiguration,
): boolean {
  return Boolean(
    previous &&
    previous.projectJdkPath === next.projectJdkPath &&
    previous.gradleJavaHome === next.gradleJavaHome &&
    previous.runtimes.every((runtime) =>
      next.runtimes.some((candidate) => JSON.stringify(candidate) === JSON.stringify(runtime)),
    ),
  );
}

export interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}
export interface LspDiagnostic {
  range: LspRange;
  severity?: number;
  message: string;
  source?: string;
  code?: string | number;
}
export interface JavaDiagnosticSnapshot {
  uri: string;
  status: "current" | "stale" | "unavailable";
  analyzedContentHash?: string;
  beforeContentHash?: string;
  afterContentHash?: string;
  changedDuringAnalysis: boolean;
  diagnostics: LspDiagnostic[];
  reason?: string;
}

function javaSettings(configuration: JavaProjectConfiguration) {
  return {
    java: {
      ...(configuration.projectJdkPath ? { home: configuration.projectJdkPath } : {}),
      configuration: { runtimes: configuration.runtimes, updateBuildConfiguration: "automatic" },
      import: {
        maven: { enabled: true },
        gradle: {
          enabled: true,
          ...(configuration.gradleJavaHome ? { java: { home: configuration.gradleJavaHome } } : {}),
        },
      },
    },
  };
}

export class JavaLanguageServer {
  private settings: ReturnType<typeof javaSettings> | undefined;
  private connection?: StdioJsonRpc;
  private capabilities: Record<string, unknown> = {};

  constructor(
    private readonly options: {
      resources: JavaLanguageResources;
      workspaceRoot: string;
      runDirectory: string;
      configuration: JavaProjectConfiguration;
      logger: Logger;
      onExit(error: Error): void;
      onInvalidation(): void;
    },
  ) {}

  async start(signal: AbortSignal): Promise<void> {
    const { resources, runDirectory, workspaceRoot, logger, configuration } = this.options;
    const platform =
      process.platform === "win32"
        ? "win"
        : process.platform === "darwin"
          ? "mac"
          : process.platform === "linux"
            ? "linux"
            : undefined;
    if (
      !platform ||
      !["x64", "arm64"].includes(process.arch) ||
      (platform === "win" && process.arch !== "x64")
    )
      throw new Error("Java language service is unsupported on this platform");
    const shared = path.join(
      resources.jdtlsRoot,
      `config_${platform}${process.arch === "arm64" ? "_arm" : ""}`,
    );
    await Promise.all(
      [resources.javaExecutable, resources.lombokJar, resources.extensionJar, shared].map((file) =>
        access(file),
      ),
    );
    const launcher = (await readdir(path.join(resources.jdtlsRoot, "plugins"))).find((file) =>
      /^org\.eclipse\.equinox\.launcher_.*\.jar$/.test(file),
    );
    if (!launcher) throw new Error("Bundled JDT LS launcher is missing");
    await mkdir(runDirectory, { recursive: true });
    this.settings = javaSettings(configuration);
    let resolveReady!: () => void;
    let rejectReady!: (error: Error) => void;
    const ready = new Promise<void>((resolve, reject) => {
      resolveReady = resolve;
      rejectReady = reject;
    });
    // 初始化失败可能先于等待就绪；保留拒绝传播，同时避免后台未处理 rejection。
    void ready.catch(() => {});
    const abort = () =>
      rejectReady(
        signal.reason instanceof Error ? signal.reason : new Error("Language startup cancelled"),
      );
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    signal.throwIfAborted();
    this.connection = new StdioJsonRpc({
      executable: resources.javaExecutable,
      args: [
        `-javaagent:${resources.lombokJar}`,
        "-Declipse.application=org.eclipse.jdt.ls.core.id1",
        "-Dosgi.bundles.defaultStartLevel=4",
        "-Declipse.product=org.eclipse.jdt.ls.core.product",
        "-Dosgi.checkConfiguration=true",
        `-Dosgi.sharedConfiguration.area=${shared}`,
        "-Dosgi.sharedConfiguration.area.readOnly=true",
        "-Dosgi.configuration.cascaded=true",
        "-Dlog.level=INFO",
        "-Xmx1G",
        "--add-modules=ALL-SYSTEM",
        "--add-opens",
        "java.base/java.util=ALL-UNNAMED",
        "--add-opens",
        "java.base/java.lang=ALL-UNNAMED",
        "-Djdk.xml.maxGeneralEntitySizeLimit=0",
        "-Djdk.xml.totalEntitySizeLimit=0",
        "-jar",
        path.join(resources.jdtlsRoot, "plugins", launcher),
        "-configuration",
        path.join(runDirectory, "configuration"),
        "-data",
        path.join(runDirectory, "data"),
      ],
      cwd: workspaceRoot,
      logger,
      notification: (method, params) => {
        const status = params as { type?: string; message?: string } | null;
        if (method === "language/status" && status?.type === "Started") resolveReady();
        if (method === "language/status" && status?.type === "Error")
          rejectReady(new Error(status.message ?? "Java project import failed"));
      },
      serverRequest: (method, params) => {
        if (method === "workspace/applyEdit")
          return { applied: false, failureReason: "Language tools cannot modify workspace files" };
        if (method === "workspace/configuration")
          return (params as { items: Array<{ section?: string }> }).items.map(
            ({ section }) =>
              section
                ?.split(".")
                .reduce<unknown>(
                  (value, key) =>
                    value && typeof value === "object"
                      ? (value as Record<string, unknown>)[key]
                      : undefined,
                  this.settings,
                ) ?? this.settings,
          );
        if (method === "workspace/workspaceFolders")
          return [{ uri: pathToFileURL(workspaceRoot).href, name: path.basename(workspaceRoot) }];
        if (method === "client/registerCapability" || method === "client/unregisterCapability")
          this.options.onInvalidation();
        return null;
      },
      onExit: (error) => {
        rejectReady(error);
        this.options.onExit(error);
      },
    });
    try {
      const result = await this.connection.request<{ capabilities: Record<string, unknown> }>(
        "initialize",
        {
          processId: process.pid,
          rootUri: pathToFileURL(workspaceRoot).href,
          workspaceFolders: [
            { uri: pathToFileURL(workspaceRoot).href, name: path.basename(workspaceRoot) },
          ],
          capabilities: {
            general: { positionEncodings: ["utf-16"] },
            workspace: { configuration: true, workspaceFolders: true },
            window: { workDoneProgress: true },
            textDocument: { synchronization: { didSave: true } },
          },
          initializationOptions: {
            bundles: [resources.extensionJar],
            workspaceFolders: [pathToFileURL(workspaceRoot).href],
            settings: this.settings,
          },
        },
        signal,
      );
      this.capabilities = result.capabilities;
      if (result.capabilities.positionEncoding && result.capabilities.positionEncoding !== "utf-16")
        throw new Error("Unsupported language server position encoding");
      this.connection.notify("initialized", {});
      await ready;
      logger.info("Java language server ready", { workspacePath: workspaceRoot });
    } finally {
      signal.removeEventListener("abort", abort);
    }
  }

  updateConfiguration(configuration: JavaProjectConfiguration): void {
    this.settings = javaSettings(configuration);
    this.notify("workspace/didChangeConfiguration", { settings: this.settings });
  }

  supports(capability: string): boolean {
    return Boolean(this.capabilities[capability]);
  }
  supportsDiagnostics(): boolean {
    return (
      (this.capabilities.executeCommandProvider as { commands?: string[] } | undefined)?.commands ??
      []
    ).includes("zcode.java.diagnosticsSnapshot");
  }
  request<T = unknown>(method: string, params: unknown, signal: AbortSignal): Promise<T> {
    if (!this.connection) return Promise.reject(new Error("Language server has not started"));
    return this.connection.request<T>(method, params, signal);
  }
  notify(method: string, params: unknown): void {
    this.connection?.notify(method, params);
  }
  async close(): Promise<void> {
    await this.connection?.close();
  }
}

type LspLocation = {
  uri?: string;
  range?: LspRange;
  targetUri?: string;
  targetSelectionRange?: LspRange;
};
type LspSymbol = {
  name: string;
  kind: number;
  location?: LspLocation;
  selectionRange?: LspRange;
  range?: LspRange;
  children?: LspSymbol[];
  containerName?: string;
};

export function languageLocation(uri: string, range: LspRange): LanguageLocation {
  return {
    path: uri.startsWith("file:") ? fileURLToPath(uri) : uri,
    start: { line: range.start.line + 1, column: range.start.character + 1 },
    end: { line: range.end.line + 1, column: range.end.character + 1 },
  };
}

export function languageLocations(value: unknown): LanguageLocation[] {
  const items = (Array.isArray(value) ? value : value ? [value] : []) as LspLocation[];
  return items.flatMap((item) => {
    const uri = item.targetUri ?? item.uri;
    const range = item.targetSelectionRange ?? item.range;
    return uri && range ? [languageLocation(uri, range)] : [];
  });
}

export function languageSymbols(value: unknown, documentUri?: string): LanguageSymbol[] {
  const output: LanguageSymbol[] = [];
  const visit = (items: LspSymbol[], containerName?: string) => {
    for (const item of items) {
      const uri = item.location?.uri ?? documentUri;
      const range = item.location?.range ?? item.selectionRange ?? item.range;
      if (uri && range)
        output.push({
          name: item.name,
          kind: item.kind,
          location: languageLocation(uri, range),
          containerName: item.containerName ?? containerName,
        });
      if (item.children) visit(item.children, item.name);
    }
  };
  visit(Array.isArray(value) ? (value as LspSymbol[]) : []);
  return output;
}

export function languageDiagnostics(uri: string, values: LspDiagnostic[]): LanguageDiagnostic[] {
  return values.map((item) => ({
    ...languageLocation(uri, item.range),
    severity:
      (["error", "warning", "information", "hint"] as const)[(item.severity ?? 1) - 1] ??
      "information",
    message: item.message.slice(0, 2048),
    ...(item.code !== undefined ? { code: String(item.code).slice(0, 100) } : {}),
    ...(item.source ? { source: item.source.slice(0, 100) } : {}),
  }));
}

export function languageHover(value: unknown): string {
  const content = (value as { contents?: unknown } | null)?.contents;
  const items = Array.isArray(content) ? content : [content];
  return items
    .map((item) =>
      typeof item === "string"
        ? item
        : item && typeof item === "object" && "value" in item
          ? String(item.value)
          : "",
    )
    .join("\n");
}
