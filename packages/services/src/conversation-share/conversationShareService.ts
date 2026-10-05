/* oxlint-disable eslint(max-lines) -- 发布、远端 staging、安全轮询和原子导入共享同一 attempt 生命周期，拆分会让清理与进度状态失去单一 owner。 */
import { createHash, randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import { z } from "zod";

import type { ConversationShareContinuation, Locale } from "@zcode/shared";
import { decodeConversationShareRows, resolveRuntimeZCodeEndpointOrigin } from "@zcode/shared";
import { Emitter } from "@zcode/rpc";
import type { IZCodeSessionService } from "#src/zcode-session/zcodeSession.js";
import { getConversationWorkspaceDir } from "#src/paths.js";
import { createServiceLogger, type ServiceLogger } from "#src/logger/serviceLogger.js";
import {
  ConversationShareServiceError,
  type IConversationShareService,
  type ConversationShareImportProgress,
  type ConversationShareFailureIssue,
  type ImportConversationShareInput,
  type ImportConversationShareResult,
  type ImportedConversationShare,
} from "./conversationShare.js";
import { type ConversationShareHttpClient } from "./conversationShareHttpClient.js";
import { formatSharedContextV1 } from "./sharedContextFormatter.js";
// download 兜底不能是裸 fetch（无 AbortSignal/超时）：对象存储连接挂住时导入会停在
// downloading 阶段直到 undici 默认 ~300s 兜底，体验上等于卡死。120s 覆盖慢速下行的大 artifact。
const DOWNLOAD_TIMEOUT_MS = 120_000;
// 预检快照的兜底上限：单次分享最多写入所选轮次数量的条目，200 足够覆盖正常会话，
// 又能保证长驻 host 不会因为「一直预检、从不发布」而无限增长。
// 预检 stat 的并发上限：本地几乎无差别，SSH/远程 workspace 下每次 stat 都是一次
// 网络往返，串行会让「下一步」长时间停在 checking。上限保证不把远端 host 打爆。

function sanitizeFileSegment(value: string): string {
  const forbidden = new Set(["<", ">", ":", '"', "/", "\\", "|", "?", "*"]);
  return [...value.normalize("NFKC")]
    .map((character) =>
      character.codePointAt(0)! < 32 || forbidden.has(character) ? "-" : character,
    )
    .join("");
}

function uniqueImportedFileName(
  displayName: string,
  artifactId: string,
  usedNames: Set<string>,
): string {
  const base =
    sanitizeFileSegment(basename(displayName.replace(/\\/gu, "/")))
      .replace(/^[. ]+|[. ]+$/gu, "")
      .slice(0, 180) || "artifact";
  let candidate = base;
  if (usedNames.has(candidate.toLowerCase())) {
    const dot = base.lastIndexOf(".");
    const suffix = artifactId.replace(/[^A-Za-z0-9]/gu, "").slice(-8) || "artifact";
    candidate = dot > 0 ? `${base.slice(0, dot)}-${suffix}${base.slice(dot)}` : `${base}-${suffix}`;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

interface ConversationShareServiceOptions {
  client: ConversationShareHttpClient;
  now?: () => number;
  zcodeSessionService?: Pick<IZCodeSessionService, "createSession" | "listSessions">;
  download?: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
  /** 单个 artifact 下载的超时（含读 body）；缺省 120s。 */
  downloadTimeoutMs?: number;
  conversationWorkspaceRoot?: string;
  /** 只由 Desktop Host 注入的 canonical share 页面根地址。 */
  shareWebUrl?: string;
  logger?: ServiceLogger;
}

function workspaceKeyOf(path: string | undefined, identity: string | undefined): string {
  return identity?.trim() || path?.trim() || "__default_conversation_workspace__";
}

function importDedupeKey(shareCode: string, workspaceKey: string): string {
  return `${shareCode}\u0000${workspaceKey}`;
}

/**
 * 导入会话的标题前缀。services 层没有 intl，这里只维护一份最小映射；
 * 前缀在导入时定型并持久化为 session.title（titleSource: "custom"），之后切界面语言不再改写。
 */
const IMPORTED_SHARE_TITLE_PREFIX: Readonly<Record<Locale, string>> = {
  "zh-CN": "来自分享：",
  "en-US": "From Share: ",
};

function formatImportedShareSessionTitle(shareTitle: string, locale: Locale | undefined): string {
  return `${IMPORTED_SHARE_TITLE_PREFIX[locale ?? "zh-CN"]}${shareTitle.trim()}`;
}

/** 本端产出的只读副本格式版本；与 wire 的 schema_version 各自独立演进。 */
const IMPORTED_CONVERSATION_SHARE_FORMAT_VERSION = 1;

/**
 * 落盘的只读副本形状；来自磁盘，渲染前必须校验。
 *
 * formatVersion 与 rows 都刻意宽容：用户在新版导入过会话后回退到旧版时，只读块应该尽量
 * 显示出来（认不出的行跳过 + 顶部软提示），而不是整块静默消失让人以为内容丢了。
 */
const importedConversationShareFileSchema = z
  .object({
    formatVersion: z.number().int().positive(),
    shareId: z.string().trim().min(1),
    contextId: z.string().trim().min(1),
    title: z.string(),
    rows: z.array(z.unknown()),
    artifacts: z.array(
      z.object({
        artifactId: z.string().trim().min(1),
        displayName: z.string(),
        mimeType: z.string().optional(),
        workspaceRelativePath: z.string().optional(),
      }),
    ),
  })
  .strip();

function throwServiceError(
  kind: ConstructorParameters<typeof ConversationShareServiceError>[0],
  message: string,
): never {
  throw new ConversationShareServiceError(kind, message);
}

export class ConversationShareService implements IConversationShareService {
  private readonly client: ConversationShareHttpClient;
  private readonly now: () => number;
  private readonly importProgressEmitters = new Map<
    string,
    Emitter<ConversationShareImportProgress>
  >();
  private readonly zcodeSessionService?: Pick<
    IZCodeSessionService,
    "createSession" | "listSessions"
  >;
  private readonly download: (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;
  private readonly downloadTimeoutMs: number;
  private readonly conversationWorkspaceRoot: string;
  private readonly shareWebUrl: string;
  private readonly importIndexPath: string;
  private readonly logger: ServiceLogger;
  // 选择阶段与发布阶段共享“最终可见卡片”边界；发布仍会重新 stat/read，但不会重新
  // 纳入选择阶段已经因缺失而被 UI 隐藏的候选。
  //
  // 生命周期：desktop host 是长驻进程，这张表原来只在 stat 未 settle 时删单条，
  // 会随使用时长单调增长。现在有两道回收：发布终态按 session 前缀清理，
  // 以及 set 时的 FIFO 上限兜底（覆盖用户中途放弃分享、永远不发布的路径）。
  private readonly completedImports = new Map<string, ImportConversationShareResult>();
  private readonly completedImportsByWorkspace = new Map<string, ImportConversationShareResult>();
  private readonly inFlightImports = new Map<string, Promise<ImportConversationShareResult>>();
  private readonly inFlightImportsByWorkspace = new Map<
    string,
    Promise<ImportConversationShareResult>
  >();
  private completedImportsLoaded!: Promise<void>;
  private importIndexWriteChain: Promise<void> = Promise.resolve();

  constructor(options: ConversationShareServiceOptions) {
    this.client = options.client;
    this.now = options.now ?? Date.now;
    this.zcodeSessionService = options.zcodeSessionService;
    this.download = options.download ?? ((url, init) => fetch(url, { signal: init?.signal }));
    this.downloadTimeoutMs = options.downloadTimeoutMs ?? DOWNLOAD_TIMEOUT_MS;
    this.conversationWorkspaceRoot =
      options.conversationWorkspaceRoot ?? getConversationWorkspaceDir();
    // 兜底写死生产站 https://zcode.z.ai/cn/share，于是测试环境（API base 走
    // 配置的 ZCode origin）导入后回链仍指向生产站，点分割线打开的是另一个环境的分享。
    // 改用与 API base 同一个环境解析器（buildRuntimeZCodeApiUrl 也走它），保证同环境。
    // 优先级不变：显式 option > ZCODE_CONVERSATION_SHARE_WEB_URL > 按环境推导。
    this.shareWebUrl = (
      options.shareWebUrl ??
      process.env.ZCODE_CONVERSATION_SHARE_WEB_URL ??
      `${resolveRuntimeZCodeEndpointOrigin(process.env)}/cn/share`
    ).replace(/\/+$/u, "");
    this.importIndexPath = join(this.conversationWorkspaceRoot, ".zcode-share-imports.json");
    this.logger = options.logger ?? createServiceLogger("conversation-share");
    this.completedImportsLoaded = this.loadCompletedImportIndex();
    if (this.zcodeSessionService) {
      void this.cleanupAbandonedImports().catch(() => undefined);
    }
  }

  getPreview(shareCode: string) {
    return this.client.getPreview(shareCode);
  }

  getContinuation(input: { shareCode: string; clientRequestId: string }) {
    return this.client.getContinuation(input.shareCode, {
      schema_version: 1,
      client_request_id: input.clientRequestId,
    });
  }

  onDynamicImportProgress(operationId: string) {
    return this.getImportProgressEmitter(operationId).event;
  }

  /**
   * 下载单个 artifact 的字节：带单请求超时（含读 body）与 Content-Length 预检。
   *
   * download 兜底不能是裸 fetch（无 AbortSignal），且 size/SHA-256 校验不能在
   * arrayBuffer() 之后才执行——挂住的连接会让导入无限停在 downloading 阶段（undici 默认
   * ~300s 兜底，体验上等于卡死）；被篡改的存储还能让客户端先把超大 payload 全量读进内存
   * 再发现不符。超时按 network 失败；Content-Length 声明超过 manifest 的 size_bytes 时
   * 在读 body 前直接判 integrity 失败并中断连接——完整性校验放在无界下载之后只保证
   * 正确性，不保护客户端资源。
   */
  private async downloadArtifactBytes(
    artifact: ConversationShareContinuation["artifacts"][number],
  ): Promise<{ bytes: Uint8Array; responseMimeType?: string }> {
    const artifactIssue = (
      code: ConversationShareFailureIssue["code"],
      extra?: { actual?: number; limit?: number },
    ): ConversationShareFailureIssue => ({
      code,
      scope: "artifact",
      artifactDisplayName: artifact.display_name,
      artifactType: artifact.artifact_type,
      extension: artifact.extension,
      mimeType: artifact.mime_type,
      phase: "downloading",
      ...(extra?.actual === undefined ? {} : { actual: extra.actual }),
      ...(extra?.limit === undefined ? {} : { limit: extra.limit }),
    });
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), this.downloadTimeoutMs);
    try {
      const response = await this.download(artifact.download_url, { signal: controller.signal });
      if (!response.ok) {
        throw new ConversationShareServiceError(
          "network",
          "Conversation artifact download failed",
          { issues: [artifactIssue("unknown")] },
        );
      }
      const declaredBytes = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredBytes) && declaredBytes > artifact.size_bytes) {
        // body 已确定不会通过校验：先中断连接再抛错，不把超大响应读进内存。
        controller.abort();
        throw new ConversationShareServiceError(
          "invalid_contract",
          "Conversation artifact integrity check failed",
          {
            issues: [
              artifactIssue("artifact_changed", {
                actual: declaredBytes,
                limit: artifact.size_bytes,
              }),
            ],
          },
        );
      }
      const bytes = new Uint8Array(await response.arrayBuffer());
      const responseMimeType = response.headers.get("content-type")?.split(";", 1)[0]?.trim();
      return { bytes, responseMimeType };
    } catch (error) {
      if (controller.signal.aborted && !(error instanceof ConversationShareServiceError)) {
        throw new ConversationShareServiceError(
          "network",
          "Conversation artifact download timed out",
          {
            issues: [artifactIssue("unknown")],
          },
        );
      }
      throw error;
    } finally {
      clearTimeout(abortTimer);
    }
  }

  async importShare(
    input: ImportConversationShareInput,
    operationId: string,
  ): Promise<ImportConversationShareResult> {
    await this.completedImportsLoaded;
    const workspaceKey = workspaceKeyOf(input.targetWorkspacePath, input.targetWorkspaceIdentity);
    const workspaceKeyedShare = importDedupeKey(input.shareCode, workspaceKey);
    const key = `${workspaceKeyedShare}\u0000${input.clientRequestId}`;
    const completed =
      this.completedImports.get(key) ?? this.completedImportsByWorkspace.get(workspaceKeyedShare);
    if (completed) {
      this.logger.info(undefined, "conversation share import reused", {
        operationId,
        phase: "complete",
      });
      return { ...completed, reused: true };
    }
    const inFlight =
      this.inFlightImports.get(key) ?? this.inFlightImportsByWorkspace.get(workspaceKeyedShare);
    if (inFlight) {
      return inFlight;
    }
    const promise = this.importShareInternal(input, operationId)
      .then((result) => {
        this.completedImports.set(key, result);
        this.completedImportsByWorkspace.set(workspaceKeyedShare, result);
        return this.persistCompletedImportIndex()
          .catch(() => undefined)
          .then(() => result);
      })
      .finally(() => {
        this.inFlightImports.delete(key);
      });
    this.inFlightImports.set(key, promise);
    this.inFlightImportsByWorkspace.set(workspaceKeyedShare, promise);
    void promise.then(
      () => {
        if (this.inFlightImportsByWorkspace.get(workspaceKeyedShare) === promise) {
          this.inFlightImportsByWorkspace.delete(workspaceKeyedShare);
        }
      },
      () => {
        if (this.inFlightImportsByWorkspace.get(workspaceKeyedShare) === promise) {
          this.inFlightImportsByWorkspace.delete(workspaceKeyedShare);
        }
      },
    );
    return promise;
  }

  private async importShareInternal(
    input: ImportConversationShareInput,
    operationId: string,
  ): Promise<ImportConversationShareResult> {
    if (!this.zcodeSessionService) {
      throwServiceError("feature_disabled", "Conversation share import is unavailable");
    }
    // 两个摘要已在 ConversationShareHttpClient.getContinuation 里对服务端原样发来的值复核过。
    // 不能在这里拿解析产物重算：zod 默认剥掉未知字段，那样发布端加一个 optional 字段就会让
    // 所有老客户端算出不同的哈希，把纯 additive 的演进误报成「分享文件校验失败」。
    const continuation = await this.getContinuation(input);

    const remoteTarget =
      input.targetWorkspaceKind === "remote" || Boolean(input.targetWorkspaceIdentity);
    const workspacePath =
      input.targetWorkspacePath && !remoteTarget
        ? input.targetWorkspacePath
        : this.conversationWorkspaceRoot;
    const workspaceIdentity =
      input.targetWorkspaceIdentity && !remoteTarget ? input.targetWorkspaceIdentity : undefined;
    const shareRoot = join(workspacePath, ".zcode-share");
    const importRoot = join(shareRoot, sanitizeFileSegment(continuation.share.share_id));
    const markerPath = join(importRoot, ".zcode-share-import.json");
    const stagingPath = join(importRoot, ".share-import-staging");
    const finalArtifactsPath = join(importRoot, "shared-artifacts");
    const conversationPath = join(importRoot, "shared-conversation.json");
    const importId = randomUUID();
    const contextId = `shared-context-${randomUUID()}`;
    const sessionId = `share-import-${randomUUID()}`;
    // 这个 URL 会进持久化的 provenance 与 sharedContextImport 快照，而
    // sharedContextImportV2StateSchema 只接受规范的 /cn/share/<code>；durable 记录也不该
    // 存随界面语言变化的值（用户之后切语言，存的就错了）。本地化只在展示时做。
    const shareUrl = `${this.shareWebUrl}/${encodeURIComponent(input.shareCode)}`;
    await mkdir(shareRoot, { recursive: true });
    try {
      const existingMarker = JSON.parse(await readFile(markerPath, "utf8")) as Record<
        string,
        unknown
      >;
      if (
        existingMarker.shareCode === input.shareCode &&
        typeof existingMarker.sessionId === "string" &&
        existingMarker.sessionId.startsWith("share-import-")
      ) {
        const sessions = await this.zcodeSessionService.listSessions({ workspacePath, limit: 100 });
        const existingSession = sessions.find(
          (item) => item.sessionId === existingMarker.sessionId,
        );
        if (
          existingSession &&
          typeof existingMarker.contextId === "string" &&
          typeof existingMarker.shareUrl === "string"
        ) {
          return {
            workspacePath,
            ...(workspaceIdentity ? { workspaceIdentity } : {}),
            sessionId: existingSession.sessionId,
            contextId: existingMarker.contextId,
            shareUrl: existingMarker.shareUrl,
            title: existingSession.title,
            reused: true,
          };
        }
        await rm(importRoot, { recursive: true, force: true });
      }
    } catch {
      // 没有 marker 或 marker 不完整时继续创建；非本次 share 的目录不会被删除。
    }
    // 语义是「失败时是否还允许删 importRoot」，不是「我创建了它」：session 一旦提交
    // 就必须解除武装（见下方 createSession 之后）。
    let importRootCleanupArmed = false;
    try {
      await mkdir(importRoot);
      importRootCleanupArmed = true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throwServiceError("unknown", "Conversation share import is already in progress");
      }
      throw error;
    }
    try {
      await writeFile(
        markerPath,
        JSON.stringify({
          importId,
          shareCode: input.shareCode,
          clientRequestId: input.clientRequestId,
          sessionId,
          shareId: continuation.share.share_id,
          contextId,
          shareUrl,
          workspaceKey: workspaceKeyOf(workspacePath, workspaceIdentity),
          phase: "preparing",
          createdAt: this.now(),
        }),
        "utf8",
      );
    } catch (error) {
      await rm(importRoot, { recursive: true, force: true }).catch(() => undefined);
      throw error;
    }
    try {
      await mkdir(stagingPath);
      const installedArtifacts: Array<{
        artifactId: string;
        workspaceRelativePath: string;
        displayName: string;
        mimeType: string;
        sha256: string;
      }> = [];
      const usedNames = new Set<string>();
      let completedArtifacts = 0;
      this.reportImportProgress(operationId, "downloading", 0, continuation.artifacts.length);
      await writeFile(
        markerPath,
        JSON.stringify({
          importId,
          shareCode: input.shareCode,
          clientRequestId: input.clientRequestId,
          sessionId,
          shareId: continuation.share.share_id,
          contextId,
          shareUrl,
          workspaceKey: workspaceKeyOf(workspacePath, workspaceIdentity),
          phase: "downloading",
          createdAt: this.now(),
        }),
        "utf8",
      );
      for (const artifact of continuation.artifacts) {
        const { bytes, responseMimeType } = await this.downloadArtifactBytes(artifact);
        const sha256 = createHash("sha256").update(bytes).digest("hex");
        if (bytes.byteLength !== artifact.size_bytes || sha256 !== artifact.sha256) {
          throw new ConversationShareServiceError(
            "invalid_contract",
            "Conversation artifact integrity check failed",
            {
              issues: [
                {
                  code: "artifact_changed",
                  scope: "artifact",
                  artifactDisplayName: artifact.display_name,
                  artifactType: artifact.artifact_type,
                  extension: artifact.extension,
                  mimeType: artifact.mime_type,
                  actual: bytes.byteLength,
                  limit: artifact.size_bytes,
                  phase: "downloading",
                },
              ],
            },
          );
        }
        // content-type 不一致不能直接判 invalid_contract，否则 .md 一律导入失败——
        // 对象存储/CDN 按自己的规则给下载打标签（.md 常被标成 text/plain 或
        // application/octet-stream），与发布时的 mime_type 无关。
        //
        // 而到这一行字节已经通过 size + SHA-256 校验，且清单本身由 artifact_set_sha256 覆盖，
        // 所以 artifact.mime_type 才是权威值，响应头不提供任何额外完整性保证——
        // 拿它当门禁只会造成误拒。这里降级为记录，不再阻断。
        if (
          responseMimeType &&
          responseMimeType.toLowerCase() !== artifact.mime_type.toLowerCase()
        ) {
          this.logger.info(undefined, "conversation share artifact content-type differs", {
            artifactType: artifact.artifact_type,
            extension: artifact.extension,
            expectedMimeType: artifact.mime_type,
            responseMimeType,
          });
        }
        const fileName = uniqueImportedFileName(
          artifact.display_name,
          artifact.artifact_id,
          usedNames,
        );
        await writeFile(join(stagingPath, fileName), bytes);
        installedArtifacts.push({
          artifactId: artifact.artifact_id,
          workspaceRelativePath: `.zcode-share/${sanitizeFileSegment(continuation.share.share_id)}/shared-artifacts/${fileName}`,
          displayName: artifact.display_name,
          mimeType: artifact.mime_type,
          sha256: artifact.sha256,
        });
        completedArtifacts += 1;
        this.reportImportProgress(
          operationId,
          "downloading",
          completedArtifacts,
          continuation.artifacts.length,
        );
      }
      this.reportImportProgress(
        operationId,
        "installing",
        completedArtifacts,
        continuation.artifacts.length,
      );
      await writeFile(
        markerPath,
        JSON.stringify({
          importId,
          shareCode: input.shareCode,
          clientRequestId: input.clientRequestId,
          sessionId,
          shareId: continuation.share.share_id,
          contextId,
          shareUrl,
          workspaceKey: workspaceKeyOf(workspacePath, workspaceIdentity),
          phase: "installing",
          createdAt: this.now(),
        }),
        "utf8",
      );
      await rename(stagingPath, finalArtifactsPath);
      // 只读块要能永久离线打开：分享可能过期或尚未上线，渲染时不能回源，
      // 所以把公开 rows 与结果物元数据一起落在 importRoot 内，随失败清理一起删除。
      //
      // 写 rawRows 而不是解析产物：本端认不出的行和字段照样存下来，用户升级之后就能看到，
      // 不会因为导入当天的版本较旧而被永久抹掉。
      await writeFile(
        conversationPath,
        JSON.stringify({
          formatVersion: IMPORTED_CONVERSATION_SHARE_FORMAT_VERSION,
          shareId: continuation.share.share_id,
          contextId,
          title: continuation.share.title,
          rows: continuation.rawRows,
          artifacts: continuation.artifacts.map((artifact) => ({
            artifactId: artifact.artifact_id,
            displayName: artifact.display_name,
            mimeType: artifact.mime_type,
            workspaceRelativePath: installedArtifacts.find(
              (installed) => installed.artifactId === artifact.artifact_id,
            )?.workspaceRelativePath,
          })),
        }),
        "utf8",
      );
      const context = formatSharedContextV1({
        share: { shareId: continuation.share.share_id, title: continuation.share.title },
        rows: continuation.rows,
        installedArtifacts,
      });
      if (context.unsupportedKinds.length > 0) {
        // 模型侧 shared_context 少了内容：不阻断导入，但必须留痕。
        this.logger.info(undefined, "shared context skipped row kinds this build cannot format", {
          kinds: context.unsupportedKinds,
        });
      }
      this.reportImportProgress(
        operationId,
        "committing",
        completedArtifacts,
        continuation.artifacts.length,
      );
      await writeFile(
        markerPath,
        JSON.stringify({
          importId,
          shareCode: input.shareCode,
          clientRequestId: input.clientRequestId,
          sessionId,
          shareId: continuation.share.share_id,
          contextId,
          shareUrl,
          workspaceKey: workspaceKeyOf(workspacePath, workspaceIdentity),
          phase: "committing",
          createdAt: this.now(),
        }),
        "utf8",
      );
      const snapshot = await this.zcodeSessionService.createSession({
        workspacePath,
        ...(workspaceIdentity ? { workspaceIdentity } : {}),
        sessionId,
        persistence: "immediate",
        importedHistory: {
          source: "sharedContext",
          // 会话标题加前缀，让导入的会话在任务列表里一眼可识别。
          // 注意 UI 侧没有任何地方读 sharedContextImport.title（只读 contextId/status/shareUrl），
          // 所以前缀不会污染展示；CLI 已直接用 importedHistory.title 写 session.title。
          title: formatImportedShareSessionTitle(continuation.share.title, input.locale),
          markdown: context.markdown,
          provenance: {
            shareId: continuation.share.share_id,
            contextId,
            shareUrl,
            status: "pending",
            projectionSha256: continuation.integrity.projection_sha256,
            artifactSetSha256: continuation.integrity.artifact_set_sha256,
            formatterVersion: 1,
            markdownSha256: context.markdownSha256,
            installedArtifacts: installedArtifacts.map((artifact) => ({
              artifactId: artifact.artifactId,
              workspaceRelativePath: artifact.workspaceRelativePath,
            })),
          },
        },
      });
      // session 已提交，且它的 provenance 引用 importRoot 里已安装的
      // artifacts。此后 marker 清理或进度上报一旦抛错，旧的 catch 会 rm -rf importRoot，
      // 用户就拿到一个引用缺失文件的会话。失败半径必须止于 createSession 之前，
      // 所以这里立刻解除清理武装；marker 是纯痕迹文件，删不掉也不该让导入失败。
      importRootCleanupArmed = false;
      await rm(markerPath, { force: true }).catch(() => undefined);
      this.reportImportProgress(
        operationId,
        "complete",
        completedArtifacts,
        continuation.artifacts.length,
      );
      return {
        workspacePath,
        workspaceIdentity,
        sessionId: snapshot.session.sessionId,
        contextId,
        shareUrl,
        title: continuation.share.title,
        reused: false,
        ...(remoteTarget
          ? { fallbackReason: "remote_workspace" as const }
          : input.targetWorkspacePath
            ? {}
            : { fallbackReason: "default_workspace" as const }),
      };
    } catch (error) {
      // 导入改为落在现有 workspace 后，删除 workspace 根目录会损坏用户项目；
      // 失败清理只能触及本次 import-owned 子目录。
      if (importRootCleanupArmed) {
        await rm(importRoot, { recursive: true, force: true }).catch(() => undefined);
      }
      throw error;
    }
  }

  /**
   * 按 contextId 找回导入时落盘的公开 rows。
   *
   * 目录名用的是 share_id 而不是 contextId（二者不等价），所以扫 .zcode-share/ 下各
   * importRoot 并比对文件内的 contextId —— 不额外维护索引，历史导入也能被读到。
   * 内容来自磁盘，属跨存储边界，必须过 schema 再交给渲染层。
   */
  async getImportedConversation(input: {
    workspacePath: string;
    contextId: string;
  }): Promise<ImportedConversationShare | null> {
    const shareRoot = join(input.workspacePath, ".zcode-share");
    let entries: Dirent[];
    try {
      entries = await readdir(shareRoot, { withFileTypes: true });
    } catch {
      return null;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(
          await readFile(join(shareRoot, entry.name, "shared-conversation.json"), "utf8"),
        );
      } catch {
        continue;
      }
      const validated = importedConversationShareFileSchema.safeParse(parsed);
      if (!validated.success || validated.data.contextId !== input.contextId) continue;
      const decoded = decodeConversationShareRows(validated.data.rows);
      // formatVersion 比本端新（用户在新版导入后回退到旧版）时，认不出的行照样计入
      // unsupportedRowCount，让 UI 出软提示——不能静默少内容。
      const unsupportedRowCount =
        decoded.unsupportedCount +
        (validated.data.formatVersion > IMPORTED_CONVERSATION_SHARE_FORMAT_VERSION ? 1 : 0);
      if (unsupportedRowCount > 0) {
        this.logger.info(
          undefined,
          "imported conversation share has content this build can't read",
          {
            formatVersion: validated.data.formatVersion,
            kinds: decoded.unsupportedKinds,
            droppedCount: decoded.unsupportedCount,
            keptCount: decoded.rows.length,
          },
        );
      }
      return {
        shareId: validated.data.shareId,
        contextId: validated.data.contextId,
        title: validated.data.title,
        rows: decoded.rows,
        artifacts: validated.data.artifacts,
        unsupportedRowCount,
      };
    }
    return null;
  }

  private async loadCompletedImportIndex(): Promise<void> {
    let raw: unknown;
    try {
      raw = JSON.parse(await readFile(this.importIndexPath, "utf8"));
    } catch {
      return;
    }
    if (!raw || typeof raw !== "object") return;
    for (const [key, value] of Object.entries(raw)) {
      if (!value || typeof value !== "object") continue;
      const record = value as Partial<ImportConversationShareResult>;
      if (
        typeof record.workspacePath !== "string" ||
        typeof record.sessionId !== "string" ||
        typeof record.title !== "string" ||
        typeof record.contextId !== "string" ||
        typeof record.shareUrl !== "string"
      ) {
        continue;
      }
      try {
        if (!(await stat(record.workspacePath)).isDirectory()) continue;
      } catch {
        continue;
      }
      const keyParts = key.split("\u0000");
      const shareCode = keyParts[0]!;
      const workspaceKey =
        keyParts[1] ?? workspaceKeyOf(record.workspacePath, record.workspaceIdentity);
      const workspaceKeyedShare = importDedupeKey(shareCode, workspaceKey);
      const result: ImportConversationShareResult = {
        workspacePath: record.workspacePath,
        ...(record.workspaceIdentity ? { workspaceIdentity: record.workspaceIdentity } : {}),
        sessionId: record.sessionId,
        contextId: record.contextId,
        shareUrl: record.shareUrl,
        title: record.title,
        reused: true,
      };
      this.completedImports.set(key, result);
      this.completedImportsByWorkspace.set(workspaceKeyedShare, result);
    }
  }

  private async writeCompletedImportIndexOnce(): Promise<void> {
    const data = Object.fromEntries(this.completedImports.entries());
    const temporaryPath = `${this.importIndexPath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, JSON.stringify(data), "utf8");
      await rename(temporaryPath, this.importIndexPath);
    } finally {
      await rm(temporaryPath, { force: true }).catch(() => undefined);
    }
  }

  private persistCompletedImportIndex(): Promise<void> {
    // 链条原来不 catch，首个写入失败后 importIndexWriteChain 永久 rejected，
    // 之后每一次 persist 都变成静默 no-op（调用点还 .catch(() => undefined) 吞掉）。
    // 索引一丢就没有恢复源（marker 在成功时已删），再导入同一 share 会撞 mkdir EEXIST
    // 而永久报 "already in progress"。修法：存起来的链条始终 resolved，只用来串行化；
    // 返回值保持可观测，让调用方自己决定是否吞掉本次失败。
    const run = this.importIndexWriteChain
      .catch(() => undefined)
      .then(() => this.writeCompletedImportIndexOnce());
    this.importIndexWriteChain = run.catch(() => undefined);
    return run;
  }

  private getImportProgressEmitter(operationId: string): Emitter<ConversationShareImportProgress> {
    const existing = this.importProgressEmitters.get(operationId);
    if (existing) return existing;
    const emitter = new Emitter<ConversationShareImportProgress>({
      onDidRemoveLastListener: () => {
        this.importProgressEmitters.delete(operationId);
        emitter.dispose();
      },
    });
    this.importProgressEmitters.set(operationId, emitter);
    return emitter;
  }

  private reportImportProgress(
    operationId: string,
    phase: ConversationShareImportProgress["phase"],
    completedArtifacts: number,
    totalArtifacts: number,
  ) {
    this.getImportProgressEmitter(operationId).fire({
      operationId,
      phase,
      completedArtifacts,
      totalArtifacts,
    });
  }

  private async cleanupAbandonedImports(): Promise<void> {
    if (!this.zcodeSessionService) return;
    await this.completedImportsLoaded;
    // 只扫描默认 conversation workspace 的 import-owned 子目录；其它 workspace 的 marker
    // 在下一次带 target 的导入请求中处理，避免启动期枚举并触碰用户项目目录。
    const shareRoot = join(this.conversationWorkspaceRoot, ".zcode-share");
    const imports = await readdir(shareRoot, { withFileTypes: true }).catch(() => []);
    for (const entry of imports) {
      if (!entry.isDirectory()) continue;
      const importRoot = join(shareRoot, entry.name);
      const markerPath = join(importRoot, ".zcode-share-import.json");
      let marker: {
        sessionId?: unknown;
        shareCode?: unknown;
        clientRequestId?: unknown;
        workspaceKey?: unknown;
        contextId?: unknown;
        shareUrl?: unknown;
      };
      try {
        marker = JSON.parse(await readFile(markerPath, "utf8")) as typeof marker;
      } catch {
        continue;
      }
      if (typeof marker.sessionId !== "string" || !marker.sessionId.startsWith("share-import-"))
        continue;
      try {
        const sessions = await this.zcodeSessionService.listSessions({
          workspacePath: this.conversationWorkspaceRoot,
          limit: 100,
        });
        const session = sessions.find((item) => item.sessionId === marker.sessionId);
        if (session) {
          if (
            typeof marker.shareCode === "string" &&
            typeof marker.clientRequestId === "string" &&
            typeof marker.contextId === "string" &&
            typeof marker.shareUrl === "string"
          ) {
            const workspaceKeyedShare = importDedupeKey(
              marker.shareCode,
              typeof marker.workspaceKey === "string"
                ? marker.workspaceKey
                : this.conversationWorkspaceRoot,
            );
            const result: ImportConversationShareResult = {
              workspacePath: this.conversationWorkspaceRoot,
              sessionId: session.sessionId,
              contextId: marker.contextId,
              shareUrl: marker.shareUrl,
              title: session.title,
              reused: true,
            };
            this.completedImports.set(
              `${workspaceKeyedShare}\u0000${marker.clientRequestId}`,
              result,
            );
            this.completedImportsByWorkspace.set(workspaceKeyedShare, result);
            await this.persistCompletedImportIndex().catch(() => undefined);
          }
          await rm(markerPath, { force: true });
        } else {
          // 只删除带合法 marker 且没有匹配 session 的本次 importRoot。
          await rm(importRoot, { recursive: true, force: true });
        }
      } catch {
        // 无法证明 session 状态时保留 importRoot，禁止把暂时性错误升级为数据删除。
      }
    }
  }
}
