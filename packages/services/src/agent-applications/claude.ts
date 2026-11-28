import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { PassThrough } from "node:stream";
import { AGENT_APPLICATION_TEST_PROMPT } from "./contract.js";
import { startApplicationProcess, stopApplicationProcess } from "./local-process.js";
import type { LocalProgram } from "./programs.js";
import type { ApplicationRuntimeResult } from "./runtime-types.js";

export async function runClaude(
  program: LocalProgram,
  cwd: string,
  signal: AbortSignal,
  modelId?: string,
): Promise<ApplicationRuntimeResult> {
  const { query } = await import("@anthropic-ai/claude-agent-sdk");
  signal.throwIfAborted();
  const input = modelId ? undefined : new PassThrough({ objectMode: true });
  const abortController = new AbortController();
  const abort = () => abortController.abort(signal.reason);
  signal.addEventListener("abort", abort, { once: true });
  let child: ChildProcessWithoutNullStreams | undefined;
  let startedAt = Date.now();
  let session: ReturnType<typeof query> | undefined;
  try {
    session = query({
      prompt: input ?? AGENT_APPLICATION_TEST_PROMPT,
      options: {
        cwd,
        abortController,
        executable: "node",
        pathToClaudeCodeExecutable: program.args[0] ?? program.file,
        spawnClaudeCodeProcess(options) {
          const entry = program.args[0];
          const file = entry ? program.file : options.command;
          // SDK 将部分 JS 后缀按原生程序启动，使用 Node 时需要补回入口参数。
          const args = entry && options.args[0] !== entry ? [entry, ...options.args] : options.args;
          startedAt = Date.now();
          const launched = startApplicationProcess(file, args, options.cwd ?? cwd, options.env);
          launched.stderr.resume();
          child = launched;
          return launched;
        },
        ...(modelId ? { model: modelId } : {}),
        persistSession: false,
        permissionMode: "dontAsk",
        maxTurns: 1,
        tools: [],
        disallowedTools: ["*"],
        strictMcpConfig: true,
        settings: { disableAllHooks: true },
        settingSources: ["user"],
      },
    });
    if (!modelId) {
      const models = await session.supportedModels();
      return { models: models.map(({ value, displayName }) => ({ id: value, name: displayName })) };
    }
    for await (const event of session) {
      if (event.type !== "result") continue;
      if (event.subtype === "success" && !event.is_error) return { reply: event.result };
      throw new Error(
        ("errors" in event ? event.errors[0] : undefined) ||
          "Claude Agent did not complete the test.",
      );
    }
    throw new Error("Claude Agent did not return a test reply.");
  } finally {
    signal.removeEventListener("abort", abort);
    input?.end();
    session?.close();
    if (child) await stopApplicationProcess(child, startedAt);
  }
}
