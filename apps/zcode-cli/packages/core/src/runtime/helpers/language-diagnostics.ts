import type { LanguageDiagnostic, LspOutput, TurnId } from "@zcode/contracts";
import type { AgentRuntimeInternal } from "../internal.js";

const baselines = new WeakMap<
  AgentRuntimeInternal,
  { generation: number; files: Map<string, LanguageDiagnostic[]> }
>();
const severity = { error: 4, warning: 3, information: 2, hint: 1 };
const key = (item: LanguageDiagnostic) =>
  JSON.stringify([item.path, item.source, item.code, item.start, item.end, item.message]);

export async function collectLanguageDiagnosticSummary(
  runtime: AgentRuntimeInternal,
  turnId: TurnId,
  signal: AbortSignal,
): Promise<string | undefined> {
  const port = runtime.languageServicePort;
  if (!port?.enabled || !runtime.registry.get("LSP")) return;
  await port.awaitPendingDiagnostics?.(runtime.sessionId, turnId, { signal, timeoutMs: 1500 });
  signal.throwIfAborted();
  const updates = port.takeDiagnosticUpdates(runtime.sessionId, turnId);
  if (!updates.length) return;
  let state = baselines.get(runtime);
  if (!state || state.generation !== runtime.branchGeneration) {
    state = { generation: runtime.branchGeneration, files: new Map() };
    baselines.set(runtime, state);
  }
  const lines = updates.map((update) => describe(update, state!.files)).filter(Boolean);
  if (!lines.length) return;
  return `Code Development diagnostics after committed edits:\n${lines.join("\n").slice(0, 6000)}`;
}

function describe(result: LspOutput, state: Map<string, LanguageDiagnostic[]>): string {
  const path = result.filePath ?? "workspace";
  if (result.status !== "ready" || result.freshness !== "current") {
    return `${path}: ${result.status}/${result.freshness}. ${result.message ?? "Analysis is not complete."} Use LSP diagnostics to inspect; do not report a clean check.`;
  }
  const previous = state.get(path);
  const current = result.diagnostics ?? [];
  const old = new Map(previous?.map((item) => [key(item), item]) ?? []);
  const fresh = current.filter(
    (item) =>
      !old.has(key(item)) || severity[item.severity] > severity[old.get(key(item))!.severity],
  );
  const currentKeys = new Set(current.map(key));
  // 有界结果未出现的旧问题可能只是落在截断部分，不能据此宣称已解决。
  const resolved = result.truncated
    ? 0
    : (previous?.filter((item) => !currentKeys.has(key(item))).length ?? 0);
  if (!result.truncated) state.set(path, current);
  if (previous && !fresh.length && !resolved) return "";
  const heading = previous
    ? "new or more severe observations"
    : "current issues (no previous baseline; not attributed to this edit)";
  const details = fresh
    .slice(0, 10)
    .map((item) => `${item.start.line}:${item.start.column} ${item.severity}: ${item.message}`)
    .join("; ");
  return `${path}: ${heading}: ${fresh.length}, resolved: ${resolved}. ${details}${fresh.length > 10 || result.truncated ? " (truncated; query LSP diagnostics for details)" : ""}`;
}
