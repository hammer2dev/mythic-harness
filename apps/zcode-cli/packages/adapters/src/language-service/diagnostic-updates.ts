import type { LspOutput, SessionId, TurnId } from "@zcode/contracts";

const keyFor = (session: SessionId, turn: TurnId) => `${session}:${turn}`;

/** 只管理借用会话的待投递结果；不持有诊断事实，也不创建模型轮次。 */
export class DiagnosticUpdates {
  private readonly currentTurns = new Map<SessionId, TurnId>();
  private readonly values = new Map<string, LspOutput[]>();
  private readonly tasks = new Map<string, Set<Promise<void>>>();

  begin(session: SessionId, turn: TurnId, result: LspOutput): void {
    const prior = this.currentTurns.get(session);
    if (prior && prior !== turn) this.values.delete(keyFor(session, prior));
    this.currentTurns.set(session, turn);
    this.complete(session, turn, result);
  }
  complete(session: SessionId, turn: TurnId, result: LspOutput): void {
    if (this.currentTurns.get(session) !== turn) return;
    const key = keyFor(session, turn);
    this.values.set(
      key,
      [
        ...(this.values.get(key) ?? []).filter((item) => item.filePath !== result.filePath),
        result,
      ].slice(-50),
    );
  }
  track(session: SessionId, turn: TurnId, task: Promise<void>): void {
    const key = keyFor(session, turn);
    const group = this.tasks.get(key) ?? new Set<Promise<void>>();
    this.tasks.set(key, group);
    group.add(task);
    void task
      .finally(() => {
        group.delete(task);
        if (!group.size) this.tasks.delete(key);
      })
      .catch(() => {});
  }
  take(session: SessionId, turn: TurnId): LspOutput[] {
    const key = keyFor(session, turn);
    const results = this.values.get(key) ?? [];
    this.values.delete(key);
    return results;
  }
  async wait(
    session: SessionId,
    turn: TurnId,
    options: { signal?: AbortSignal; timeoutMs?: number } = {},
  ): Promise<void> {
    const tasks = [...(this.tasks.get(keyFor(session, turn)) ?? [])];
    if (!tasks.length || options.signal?.aborted) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abort: (() => void) | undefined;
    try {
      await Promise.race([
        Promise.allSettled(tasks),
        new Promise<void>((resolve) => {
          abort = resolve;
          options.signal?.addEventListener("abort", abort, { once: true });
          timer = setTimeout(resolve, options.timeoutMs ?? 1500);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
      if (abort) options.signal?.removeEventListener("abort", abort);
    }
  }
  clear(): void {
    this.currentTurns.clear();
    this.values.clear();
    this.tasks.clear();
  }
}
