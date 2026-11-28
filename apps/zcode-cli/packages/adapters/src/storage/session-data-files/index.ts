import { lstat, readdir, rm } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";

import type { SessionDataFilesPort, SessionDataFile } from "./contract.js";

export type { SessionDataFilesPort } from "./contract.js";

export interface NodeSessionDataFilesOptions {
  cliStorageRoot: string;
}

/** 会话目录（每个会话一个子目录）与模型调用轨迹（每个会话一个文件）所在的位置。 */
const SESSION_DIRECTORY_ROOTS = ["artifacts", "exec", "agents", "sessions"] as const;
const MODEL_IO_DIRECTORIES = ["debug", "rollout"] as const;
// 会话 ID 直接拼进路径，必须是单个安全文件名段。
const SAFE_SESSION_ID = /^[A-Za-z0-9_-]+$/;

export function createNodeSessionDataFiles(
  options: NodeSessionDataFilesOptions,
): SessionDataFilesPort {
  const root = options.cliStorageRoot;
  const sessionPaths = (sessionId: string) => {
    if (!SAFE_SESSION_ID.test(sessionId)) throw new Error("session-data.invalid-session-id");
    return [
      ...SESSION_DIRECTORY_ROOTS.map((name) => join(root, name, sessionId)),
      ...MODEL_IO_DIRECTORIES.map((name) => join(root, name, `model-io-${sessionId}.jsonl`)),
    ];
  };
  const listSessionFiles = async (sessionId: string): Promise<SessionDataFile[]> => {
    const result: SessionDataFile[] = [];
    for (const path of sessionPaths(sessionId)) {
      const kind = path === join(root, "artifacts", sessionId) ? "artifact" : "record";
      const walk = async (current: string): Promise<void> => {
        let stats;
        try {
          stats = await lstat(current);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
          throw error;
        }
        if (stats.isSymbolicLink()) {
          result.push({
            name: basename(current),
            relativePath: relative(root, current),
            kind,
            bytes: 0,
          });
          return;
        }
        if (stats.isDirectory()) {
          for (const entry of await readdir(current)) await walk(join(current, entry));
          return;
        }
        result.push({
          name: basename(current),
          relativePath: relative(root, current),
          kind,
          bytes: stats.size,
        });
      };
      // 存储类别目录若被换成链接，不能沿祖先链接清理用户文件。
      const parent = await lstat(dirname(path)).catch((error) => {
        if (error.code === "ENOENT") return null;
        throw error;
      });
      if (parent?.isSymbolicLink()) throw new Error("session-data.symlink-root");
      await walk(path);
    }
    return result.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  };
  const removeSession = async (
    sessionId: string,
    retained: readonly string[] = [],
  ): Promise<number> => {
    const paths = sessionPaths(sessionId);
    const manifest = await listSessionFiles(sessionId);
    if (!retained.length) {
      // rm 不跟随目录内的符号链接；顶层是链接时只删除链接本身。
      await Promise.all(paths.map((path) => rm(path, { recursive: true, force: true })));
      return manifest.reduce((sum, file) => sum + file.bytes, 0);
    }
    // 保留 URI 定位所需的附件文件，绝不因为引用而留下正文、执行日志或其他独占附件。
    const keep = (file: SessionDataFile) =>
      file.kind === "artifact" && retained.some((id) => file.name.includes(id));
    let bytes = 0;
    for (const file of manifest) {
      if (keep(file)) continue;
      await rm(join(root, file.relativePath), { force: true });
      bytes += file.bytes;
    }
    for (const path of paths.slice(1)) await rm(path, { recursive: true, force: true });
    return bytes;
  };
  return {
    removeSession,
    listSessionFiles,
  };
}
