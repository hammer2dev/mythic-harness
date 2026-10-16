import type { FileSystemRevision } from "./file-system.port.js";
import type { SessionId, TurnId } from "./shared.js";
import type { TraceContext } from "../tracing/tracer.js";
import type { LspInput, LspOutput } from "../tools/lsp.js";

export interface LanguageServiceRequestOptions {
  signal?: AbortSignal;
  trace?: TraceContext;
}

export interface LanguageFileCommit {
  path: string;
  /** false 只登记事实并同步已经启动的服务，不新增分析需求或启动进程。 */
  analyze?: boolean;
  /** 已提交的 LF 文本；null 表示实际删除。 */
  content: string | null;
  revision?: FileSystemRevision;
  trace?: TraceContext;
}

/** 执行端 workspace 语言服务的借用接口；core 不拥有进程、配置和诊断缓存。 */
export interface WorkspaceLanguageServicePort {
  readonly enabled: boolean;
  /** 核对执行端有效插件配置，不启动语言进程。 */
  refresh(): Promise<void>;
  query(input: LspInput, options?: LanguageServiceRequestOptions): Promise<LspOutput>;
  /** 同步登记已提交项；语言处理在后台执行，不改变文件写入结果。 */
  recordCommit(change: LanguageFileCommit): void;
  /** 有界等待既有诊断任务；截止只表示 pending，不代表服务端已检查完成。 */
  awaitPendingDiagnostics?(
    sessionId: SessionId,
    turnId: TurnId,
    options?: { signal?: AbortSignal; timeoutMs?: number },
  ): Promise<void>;
  /** 仅取该会话/轮次已经产生的更新；不创建自主 turn。 */
  takeDiagnosticUpdates(sessionId: SessionId, turnId: TurnId): LspOutput[];
}
