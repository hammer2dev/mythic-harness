import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runAcp } from "./acp.js";
import type { ApplicationDescriptor } from "./catalog.js";
import { runClaude } from "./claude.js";
import { runCodex } from "./codex.js";
import type { LocalProgram } from "./programs.js";
import type { ApplicationRuntimeResult } from "./runtime-types.js";

export async function runApplication(
  app: ApplicationDescriptor,
  program: LocalProgram,
  signal: AbortSignal,
  modelId?: string,
): Promise<ApplicationRuntimeResult> {
  signal.throwIfAborted();
  const cwd = await mkdtemp(join(tmpdir(), "harness-agent-application-"));
  try {
    if (app.protocol === "codex") return await runCodex(program, app.args, cwd, signal, modelId);
    if (app.protocol === "claude") return await runClaude(program, cwd, signal, modelId);
    return await runAcp(program, app.args, cwd, signal, modelId);
  } finally {
    await rm(cwd, { recursive: true, force: true }).catch(() => undefined);
  }
}
