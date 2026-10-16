import type { LanguageFileCommit, Logger } from "@zcode/contracts";
import { canonical, type LanguageDocuments } from "./documents.js";
import type { JavaLanguageServer } from "./java-server.js";

/** 文件提交的唯一同步队列；读取实际字节后才更新语言文档镜像。 */
export class LanguageCommitSynchronizer {
  private readonly sequences = new Map<string, number>();
  private pending: Promise<void> = Promise.resolve();
  constructor(
    private readonly documents: LanguageDocuments,
    private readonly state: () => {
      server?: JavaLanguageServer;
      starting?: Promise<JavaLanguageServer>;
      epoch: number;
      signal: AbortSignal;
    },
    private readonly logger: Logger,
  ) {}
  current(file: string, sequence: number): boolean {
    return this.sequences.get(canonical(file)) === sequence;
  }
  barrier(): Promise<void> {
    return this.pending;
  }
  register(change: LanguageFileCommit): { file: string; sequence: number } {
    const file = this.documents.pathFor(change.path);
    const key = canonical(file);
    const sequence = (this.sequences.get(key) ?? 0) + 1;
    this.sequences.set(key, sequence);
    this.documents.generation++;
    if (change.content === null) this.documents.record(file, null, change.revision?.id);
    const previous = this.pending;
    this.pending = previous
      .catch(() => {})
      .then(async () => {
        const snapshot = this.state();
        if (!snapshot.server || !this.current(file, sequence)) return;
        if (snapshot.starting) await snapshot.starting;
        if (snapshot.server !== this.state().server || !this.current(file, sequence)) return;
        const document =
          change.content === null
            ? this.documents.get(file)
            : await this.documents.read(file, { signal: snapshot.signal, trace: change.trace });
        if (document && snapshot.server === this.state().server)
          this.documents.sync(snapshot.server, document, snapshot.epoch);
      });
    // 文件已写入的结果不等待语言服务；后续查询通过 barrier 观察实际同步失败。
    void this.pending.catch((error: unknown) =>
      this.logger.debug("Committed Java synchronization failed", { error: String(error) }),
    );
    return { file, sequence };
  }
}
