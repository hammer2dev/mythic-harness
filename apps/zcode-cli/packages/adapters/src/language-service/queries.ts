import type {
  FileSystemPort,
  LanguageServiceRequestOptions,
  LspInput,
  LspOutput,
} from "@zcode/contracts";
import {
  JavaLanguageServer,
  languageDiagnostics,
  type JavaDiagnosticSnapshot,
  type JavaProjectConfiguration,
} from "./java-server.js";
import { canonical, type DocumentState } from "./documents.js";
export const baseOutput = (
  input: LspInput,
  status: LspOutput["status"],
  message?: string,
): LspOutput => ({
  status,
  freshness: "unknown",
  scope: input.file_path ? "file" : "workspace",
  languageId: "java",
  truncated: false,
  ...(input.file_path ? { filePath: input.file_path } : {}),
  ...(message ? { message } : {}),
});

export class JavaQueries {
  constructor(private readonly state: { generation(): number; epoch(): number }) {}
  async projectProblem(
    server: JavaLanguageServer,
    uri: string,
    configuration: JavaProjectConfiguration,
    signal: AbortSignal,
  ): Promise<string | undefined> {
    const settings = await server.request<Record<string, unknown>>(
      "workspace/executeCommand",
      {
        command: "java.project.getSettings",
        arguments: [
          uri,
          ["org.eclipse.jdt.ls.core.vm.location", "org.eclipse.jdt.ls.core.natureIds"],
        ],
      },
      signal,
    );
    const vm = settings["org.eclipse.jdt.ls.core.vm.location"];
    const natures = settings["org.eclipse.jdt.ls.core.natureIds"];
    const managed =
      Array.isArray(natures) &&
      natures.some(
        (nature) =>
          nature === "org.eclipse.m2e.core.maven2Nature" ||
          nature === "org.eclipse.buildship.core.gradleprojectnature",
      );
    if (!managed && !configuration.projectJdkPath && configuration.candidatePaths.length !== 1)
      return "Unmanaged Java files require an explicit default project JDK; choose an available JDK in this conversation.";
    if (
      typeof vm !== "string" ||
      !configuration.candidatePaths.some((candidate) => canonical(candidate) === canonical(vm))
    )
      return `Project JDK is missing or unresolved. Configure a project JDK in this conversation.${configuration.ambiguities?.length ? ` ${configuration.ambiguities.join("; ")}` : ""}`;
    return undefined;
  }

  async diagnostics(
    server: JavaLanguageServer,
    document: DocumentState,
    signal: AbortSignal,
    limit: number,
  ): Promise<LspOutput> {
    const input: LspInput = { operation: "diagnostics", file_path: document.path };
    if (!server.supportsDiagnostics())
      return baseOutput(
        input,
        "unsupported",
        "Bundled Java diagnostic snapshot command is unavailable",
      );
    const generation = this.state.generation();
    const epoch = this.state.epoch();
    const result = await server.request<JavaDiagnosticSnapshot>(
      "workspace/executeCommand",
      {
        command: "zcode.java.diagnosticsSnapshot",
        arguments: [{ uri: document.uri, expectedContentHash: document.hash }],
      },
      signal,
    );
    const current =
      result.status === "current" &&
      !result.changedDuringAnalysis &&
      result.analyzedContentHash === document.hash &&
      result.beforeContentHash === document.hash &&
      result.afterContentHash === document.hash &&
      result.uri === document.uri &&
      epoch === this.state.epoch() &&
      generation === this.state.generation();
    const values = languageDiagnostics(document.uri, result.diagnostics);
    return {
      ...baseOutput(input, result.status === "unavailable" ? "pending" : "ready", result.reason),
      freshness: current ? "current" : "stale",
      fileRevision: document.revision,
      documentVersion: document.version,
      contentHash: document.hash,
      diagnostics: values.slice(0, limit),
      truncated: values.length > limit,
    };
  }
}
export async function workspaceDiagnostics(
  dependencies: {
    fileSystem: FileSystemPort;
    workspaceRoot: string;
    query(input: LspInput, options: LanguageServiceRequestOptions): Promise<LspOutput>;
  },
  input: LspInput,
  options: LanguageServiceRequestOptions,
): Promise<LspOutput> {
  const found = await dependencies.fileSystem.searchFiles(
    {
      path: dependencies.workspaceRoot,
      pattern: "**/*.java",
      maxResults: 51,
      trace: options.trace,
    },
    { signal: options.signal },
  );
  const limit = input.limit ?? 50;
  const output = baseOutput(
    input,
    "ready",
    "Bounded Java file scan; workspace index freshness remains unknown.",
  );
  output.diagnostics = [];
  output.truncated = found.truncated || found.files.length > 50;
  for (const file of found.files.slice(0, 50)) {
    const result = await dependencies.query(
      { operation: "diagnostics", file_path: file, limit },
      options,
    );
    if (result.status !== "ready") {
      output.status = result.status;
      output.message = result.message;
    }
    output.diagnostics.push(...(result.diagnostics ?? []));
    output.truncated ||= result.truncated || output.diagnostics.length > limit;
    if (output.diagnostics.length >= limit) {
      output.truncated ||= file !== found.files.at(-1);
      break;
    }
  }
  output.diagnostics = output.diagnostics.slice(0, limit);
  return output;
}
