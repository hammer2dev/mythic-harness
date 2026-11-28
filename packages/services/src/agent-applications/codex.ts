import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { z } from "zod";
import { AGENT_APPLICATION_TEST_PROMPT, type AgentApplicationModel } from "./contract.js";
import { withApplicationProcess } from "./local-process.js";
import type { LocalProgram } from "./programs.js";
import type { ApplicationRuntimeResult } from "./runtime-types.js";

const messageSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string().optional(),
  params: z.unknown().optional(),
  result: z.unknown().optional(),
  error: z.object({ message: z.string() }).optional(),
});
const accountSchema = z.object({ requiresOpenaiAuth: z.boolean(), account: z.unknown() });
const listSchema = z.object({
  data: z.array(z.object({ model: z.string(), displayName: z.string() })),
  nextCursor: z.string().nullish(),
});
const threadSchema = z.object({
  thread: z.object({ id: z.string() }),
  model: z.string(),
  sandbox: z.object({ type: z.string() }),
  approvalPolicy: z.string(),
});
const turnEventSchema = z.object({
  threadId: z.string(),
  item: z
    .object({ type: z.string(), text: z.string().optional(), phase: z.string().nullish() })
    .optional(),
  turn: z
    .object({ status: z.string(), error: z.object({ message: z.string() }).nullish() })
    .optional(),
  error: z.object({ message: z.string() }).optional(),
  willRetry: z.boolean().optional(),
});

function connectCodex(child: ChildProcessWithoutNullStreams) {
  let nextId = 0;
  const pending = new Map<
    number,
    {
      resolve(result: unknown): void;
      reject(error: Error): void;
    }
  >();
  let notification: ((method: string, params: unknown) => void) | undefined;
  const send = (message: object) => child.stdin.write(`${JSON.stringify(message)}\n`);
  const lines = createInterface({ input: child.stdout });
  const closed = new Promise<void>((resolve) =>
    lines.once("close", () => {
      for (const request of pending.values())
        request.reject(new Error("The Codex connection closed."));
      pending.clear();
      resolve();
    }),
  );
  lines.on("line", (line) => {
    let raw: unknown;
    try {
      raw = JSON.parse(line);
    } catch {
      return;
    }
    const parsed = messageSchema.safeParse(raw);
    if (!parsed.success) return;
    const { id, method, params, result, error } = parsed.data;
    if (method) {
      if (id !== undefined)
        send({
          id,
          error: { code: -32601, message: "Client requests are unavailable in diagnostics." },
        });
      else notification?.(method, params);
      return;
    }
    if (typeof id !== "number") return;
    const request = pending.get(id);
    pending.delete(id);
    if (error) request?.reject(new Error(error.message));
    else request?.resolve(result);
  });
  return {
    request(method: string, params: object): Promise<unknown> {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        send({ id, method, params });
      });
    },
    notify(method: string) {
      send({ method });
    },
    listen(listener: NonNullable<typeof notification>) {
      notification = listener;
    },
    closed,
    close() {
      lines.close();
    },
  };
}

async function readCodexModels(client: ReturnType<typeof connectCodex>) {
  const models: AgentApplicationModel[] = [];
  const cursors = new Set<string>();
  let cursor: string | undefined;
  do {
    const result = listSchema.parse(
      await client.request("model/list", { cursor, includeHidden: false }),
    );
    models.push(...result.data.map(({ model, displayName }) => ({ id: model, name: displayName })));
    cursor = result.nextCursor || undefined;
    if (cursor && cursors.has(cursor)) throw new Error("Codex returned a repeated model cursor.");
    if (cursor) cursors.add(cursor);
  } while (cursor);
  return models;
}

async function testCodex(client: ReturnType<typeof connectCodex>, cwd: string, modelId: string) {
  const { thread, model, sandbox, approvalPolicy } = threadSchema.parse(
    await client.request("thread/start", {
      cwd,
      model: modelId,
      ephemeral: true,
      sandbox: "read-only",
      approvalPolicy: "never",
      config: { features: { shell_tool: false }, web_search: "disabled" },
      developerInstructions: "Reply directly without using tools or accessing files.",
    }),
  );
  if (sandbox.type !== "readOnly" || approvalPolicy !== "never" || model !== modelId)
    throw new Error("Codex did not confirm the selected model and diagnostic permissions.");
  let reply = "";
  const complete = new Promise<string>((resolve, reject) => {
    client.listen((method, params) => {
      const parsed = turnEventSchema.safeParse(params);
      if (!parsed.success || parsed.data.threadId !== thread.id) return;
      const event = parsed.data;
      if (method === "error" && event.error && !event.willRetry) {
        reject(new Error(event.error.message));
      } else if (
        method === "item/completed" &&
        event.item?.type === "agentMessage" &&
        event.item.phase !== "commentary" &&
        event.item.text &&
        reply.length < 4000
      ) {
        reply += event.item.text.slice(0, 4000 - reply.length);
      } else if (method === "turn/completed") {
        if (event.turn?.status === "completed") resolve(reply);
        else reject(new Error(event.turn?.error?.message ?? "Codex did not complete the test."));
      }
    });
  });
  const [output] = await Promise.all([
    Promise.race([
      complete,
      client.closed.then(() => {
        throw new Error("Codex exited before completing the test.");
      }),
    ]),
    client.request("turn/start", {
      threadId: thread.id,
      model: modelId,
      input: [{ type: "text", text: AGENT_APPLICATION_TEST_PROMPT, text_elements: [] }],
    }),
  ]);
  return output;
}

export function runCodex(
  program: LocalProgram,
  args: readonly string[],
  cwd: string,
  signal: AbortSignal,
  modelId?: string,
): Promise<ApplicationRuntimeResult> {
  return withApplicationProcess(
    program.file,
    [...program.args, ...args],
    cwd,
    signal,
    async (child) => {
      const client = connectCodex(child);
      try {
        await client.request("initialize", {
          clientInfo: { name: "mythic_harness", version: "1.0.0" },
        });
        client.notify("initialized");
        const account = accountSchema.parse(
          await client.request("account/read", { refreshToken: false }),
        );
        if (account.requiresOpenaiAuth && !account.account)
          throw new Error("Sign in to Codex and try again.");
        return modelId
          ? { reply: await testCodex(client, cwd, modelId) }
          : { models: await readCodexModels(client) };
      } finally {
        client.close();
      }
    },
  );
}
