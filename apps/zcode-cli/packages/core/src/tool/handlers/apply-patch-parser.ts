export interface PatchHunk {
  before: string[];
  after: string[];
}

export interface PatchOperation {
  type: "add" | "update" | "delete" | "move";
  path: string;
  movePath?: string;
  content?: string;
  hunks: PatchHunk[];
}

export function parseApplyPatch(text: string): PatchOperation[] {
  if (text.includes("\0")) throw new Error("ApplyPatch supports text patches only: NUL byte found");
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  if (lines.at(-1) === "") lines.pop();
  if (lines.shift() !== "*** Begin Patch" || lines.pop() !== "*** End Patch") {
    throw new Error("Invalid patch: expected Begin Patch and End Patch markers");
  }
  const operations: PatchOperation[] = [];
  let index = 0;
  while (index < lines.length) {
    const header = /^\*\*\* (Add|Update|Delete) File: (.+)$/.exec(lines[index++]!);
    if (!header || !header[2]!.trim()) throw new Error("Invalid patch file header");
    const operation: PatchOperation = {
      type: header[1] === "Add" ? "add" : header[1] === "Delete" ? "delete" : "update",
      path: header[2]!,
      hunks: [],
    };
    if (operation.type === "update" && lines[index]?.startsWith("*** Move to: ")) {
      operation.type = "move";
      operation.movePath = lines[index++]!.slice("*** Move to: ".length);
      if (!operation.movePath.trim()) throw new Error("Invalid patch move destination");
    }
    if (operation.type === "add") {
      const added: string[] = [];
      while (index < lines.length && !lines[index]!.startsWith("*** ")) {
        const line = lines[index++]!;
        if (!line.startsWith("+")) throw new Error("Invalid add line: expected + prefix");
        added.push(line.slice(1));
      }
      operation.content = added.length ? `${added.join("\n")}\n` : "";
    } else if (operation.type !== "delete") {
      while (index < lines.length && !lines[index]!.startsWith("*** ")) {
        if (lines[index++] !== "@@") throw new Error("Invalid hunk: expected @@ marker");
        const hunk: PatchHunk = { before: [], after: [] };
        let changed = false;
        while (index < lines.length && lines[index] !== "@@" && !lines[index]!.startsWith("*** ")) {
          const line = lines[index++]!;
          const prefix = line[0];
          if (prefix !== " " && prefix !== "+" && prefix !== "-")
            throw new Error("Invalid hunk line prefix");
          if (prefix !== "+") hunk.before.push(line.slice(1));
          if (prefix !== "-") hunk.after.push(line.slice(1));
          changed ||= prefix !== " ";
        }
        if (!changed) throw new Error("Invalid hunk: no changes");
        operation.hunks.push(hunk);
      }
      if (operation.type === "update" && !operation.hunks.length)
        throw new Error("Invalid update: no hunks");
    }
    operations.push(operation);
  }
  if (!operations.length) throw new Error("Invalid patch: no operations");
  return operations;
}

export function applyPatchHunks(content: string, hunks: readonly PatchHunk[]): string {
  if (!hunks.length) return content;
  const newline = content.includes("\r\n") ? "\r\n" : "\n";
  const trailingNewline = content.endsWith("\n");
  const lines = content.replaceAll("\r\n", "\n").split("\n");
  if (trailingNewline || content === "") lines.pop();
  let cursor = 0;
  for (const hunk of hunks) {
    const matches: number[] = [];
    for (let index = cursor; index <= lines.length - hunk.before.length; index += 1) {
      if (hunk.before.every((line, offset) => lines[index + offset] === line)) matches.push(index);
    }
    if (!matches.length)
      throw new Error("Patch hunk not found; Read the file and use exact context");
    if (matches.length !== 1) throw new Error("Patch hunk is ambiguous; add unique context");
    const start = matches[0]!;
    lines.splice(start, hunk.before.length, ...hunk.after);
    cursor = start + hunk.after.length;
  }
  return lines.join(newline) + (trailingNewline && lines.length ? newline : "");
}
