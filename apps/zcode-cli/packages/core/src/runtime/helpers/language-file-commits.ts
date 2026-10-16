import type { FileSystemPort, LanguageFileCommit } from "@zcode/contracts";

const underlyingPorts = new WeakMap<FileSystemPort, FileSystemPort>();

/** 在真实文件提交后登记语言同步；不依赖 PostToolUse、结果序列化或 checkpoint。 */
export function observeLanguageFileCommits(
  fs: FileSystemPort,
  record: (change: LanguageFileCommit) => void,
  reportError: (error: unknown) => void,
): FileSystemPort {
  // 子代理可能继承父会话的包装端口；重新绑定本会话时不能叠加两次提交通知。
  fs = underlyingPorts.get(fs) ?? fs;
  const notify = (change: LanguageFileCommit) => {
    // 同步登记异常不能把已经落盘的写入变成失败，避免 Agent 因此重复修改文件。
    try {
      record(change);
    } catch (error) {
      reportError(error);
    }
  };
  const observed: FileSystemPort = {
    createDirectory: fs.createDirectory.bind(fs),
    stat: fs.stat.bind(fs),
    readTextFile: fs.readTextFile.bind(fs),
    readBinaryFile: fs.readBinaryFile.bind(fs),
    readTextFileRange: fs.readTextFileRange.bind(fs),
    listDirectory: fs.listDirectory.bind(fs),
    searchFiles: fs.searchFiles.bind(fs),
    searchText: fs.searchText.bind(fs),
    writeTextFile: async (request, options) => {
      const result = await fs.writeTextFile(request, options);
      notify({
        path: result.path,
        content: request.content,
        revision: result.revision,
        trace: request.trace,
      });
      return result;
    },
    removeFile: async (request, options) => {
      const result = await fs.removeFile(request, options);
      if (result.removed) notify({ path: result.path, content: null, trace: request.trace });
      return result;
    },
  };
  underlyingPorts.set(observed, fs);
  return observed;
}
