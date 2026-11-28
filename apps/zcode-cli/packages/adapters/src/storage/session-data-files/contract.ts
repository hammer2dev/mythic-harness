/**
 * 归档删除使用的会话文件。大小只统计真实文件（lstat，不跟随符号链接），
 * remove 返回删除前测得的字节数；路径不存在按 0 处理，因此重复删除幂等。
 */
export interface SessionDataFile {
  name: string;
  relativePath: string;
  kind: "artifact" | "record";
  bytes: number;
}
export interface SessionDataFilesPort {
  listSessionFiles?(sessionId: string): Promise<SessionDataFile[]>;
  removeSession(sessionId: string, retainedArtifactIds?: readonly string[]): Promise<number>;
}
