import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { Logger } from "@zcode/contracts";

type RpcMessage = {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
};
type Pending = { resolve(value: unknown): void; reject(error: Error): void; cleanup(): void };

export function waitForLanguage<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    void operation.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

export class StdioJsonRpc {
  private readonly process: ChildProcessWithoutNullStreams;
  private readonly pending = new Map<number, Pending>();
  private buffer: Buffer = Buffer.alloc(0);
  private nextId = 0;
  private stopped = false;
  private readonly exited: Promise<void>;

  constructor(options: {
    executable: string;
    args: string[];
    cwd: string;
    logger: Logger;
    notification(method: string, params: unknown): void;
    serverRequest(method: string, params: unknown): unknown | Promise<unknown>;
    onExit(error: Error): void;
  }) {
    this.process = spawn(options.executable, options.args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: "pipe",
    });
    this.exited = new Promise((resolve) => this.process.once("close", () => resolve()));
    const fail = (error: Error) => {
      if (this.stopped) return;
      this.stopped = true;
      for (const request of this.pending.values()) {
        request.cleanup();
        request.reject(error);
      }
      this.pending.clear();
      options.onExit(error);
    };
    this.process.once("error", fail);
    this.process.once("close", (code, signal) =>
      fail(new Error(`Language server exited (${code ?? signal})`)),
    );
    this.process.stdin.on("error", fail);
    this.process.stderr.on("data", (chunk: Buffer) =>
      options.logger.debug("Language server stderr", {
        text: chunk.toString("utf8").slice(0, 4000),
      }),
    );
    this.process.stdout.on("data", (chunk: Buffer) => {
      try {
        this.buffer = Buffer.concat([this.buffer, chunk]);
        while (this.buffer.length > 0) {
          const boundary = this.buffer.indexOf("\r\n\r\n");
          if (boundary < 0) {
            if (this.buffer.length > 8192) throw new Error("Invalid JSON-RPC header");
            break;
          }
          const match = /(?:^|\r\n)Content-Length:\s*(\d+)(?:\r\n|$)/i.exec(
            this.buffer.subarray(0, boundary).toString("ascii"),
          );
          const size = Number(match?.[1]);
          if (!Number.isSafeInteger(size) || size < 1 || size > 32 * 1024 * 1024)
            throw new Error("Invalid JSON-RPC message size");
          if (this.buffer.length < boundary + 4 + size) break;
          const message: RpcMessage = JSON.parse(
            this.buffer.subarray(boundary + 4, boundary + 4 + size).toString("utf8"),
          );
          this.buffer = this.buffer.subarray(boundary + 4 + size);
          if (message.method && message.id !== undefined) {
            const id = message.id;
            Promise.resolve(options.serverRequest(message.method, message.params))
              .then(
                (result) => this.send({ jsonrpc: "2.0", id, result }),
                (error: unknown) =>
                  this.send({
                    jsonrpc: "2.0",
                    id,
                    error: { code: -32603, message: String(error) },
                  }),
              )
              .catch((error: unknown) =>
                fail(error instanceof Error ? error : new Error(String(error))),
              );
          } else if (message.method) options.notification(message.method, message.params);
          else if (typeof message.id === "number") {
            const request = this.pending.get(message.id);
            if (!request) continue;
            this.pending.delete(message.id);
            request.cleanup();
            if (message.error)
              request.reject(new Error(`JSON-RPC ${message.error.code}: ${message.error.message}`));
            else request.resolve(message.result);
          }
        }
      } catch (error) {
        fail(error instanceof Error ? error : new Error(String(error)));
        this.process.kill();
      }
    });
  }

  private send(message: RpcMessage): void {
    if (this.stopped) throw new Error("Language server is closed");
    const body = Buffer.from(JSON.stringify(message), "utf8");
    this.process.stdin.write(
      Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`), body]),
    );
  }

  notify(method: string, params?: unknown): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  request<T = unknown>(method: string, params: unknown, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) return Promise.reject(signal.reason);
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const abort = () => {
        if (!this.pending.delete(id)) return;
        signal?.removeEventListener("abort", abort);
        if (!this.stopped) this.notify("$/cancelRequest", { id });
        reject(signal?.reason ?? new Error("Request cancelled"));
      };
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        cleanup: () => signal?.removeEventListener("abort", abort),
      });
      signal?.addEventListener("abort", abort, { once: true });
      try {
        this.send({ jsonrpc: "2.0", id, method, params });
      } catch (error) {
        this.pending.delete(id);
        signal?.removeEventListener("abort", abort);
        reject(error);
      }
    });
  }

  async close(): Promise<void> {
    if (!this.stopped) {
      try {
        await this.request("shutdown", null, AbortSignal.timeout(5000));
        this.notify("exit");
        this.process.stdin.end();
      } catch {
        this.process.kill();
      }
    }
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        this.exited,
        new Promise<void>((resolve) => {
          timeout = setTimeout(() => {
            this.process.kill();
            resolve();
          }, 5000);
        }),
      ]);
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
