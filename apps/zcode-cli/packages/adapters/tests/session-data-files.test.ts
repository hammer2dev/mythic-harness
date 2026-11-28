import { mkdir, mkdtemp, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createNodeSessionDataFiles } from "../src/storage/session-data-files/index.js";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function setup() {
  const root = await mkdtemp(join(tmpdir(), "session-data-files-"));
  roots.push(root);
  const cli = join(root, "cli");
  const files = createNodeSessionDataFiles({ cliStorageRoot: cli });
  const write = async (path: string, bytes: number) => {
    await mkdir(join(path, ".."), { recursive: true });
    await writeFile(path, "x".repeat(bytes));
  };
  return { root, cli, files, write };
}

describe("node session data files", () => {
  it("measures and removes every per-session location and leaves other sessions alone", async () => {
    const { cli, files, write } = await setup();
    await write(join(cli, "artifacts", "sess_a", "out.txt"), 100);
    await write(join(cli, "exec", "sess_a", "bash.log"), 20);
    await write(join(cli, "agents", "sess_a", "agent_1", "transcript.jsonl"), 3);
    await write(join(cli, "sessions", "sess_a", "workflows", "w.js"), 4);
    await write(join(cli, "debug", "model-io-sess_a.jsonl"), 5);
    await write(join(cli, "rollout", "model-io-sess_a.jsonl"), 6);
    await write(join(cli, "artifacts", "sess_b", "keep.txt"), 7);

    expect(await files.removeSession("sess_a")).toBe(138);
    expect(await files.listSessionFiles!("sess_a")).toEqual([]);
    expect(await readdir(join(cli, "artifacts"))).toEqual(["sess_b"]);
    expect(await files.listSessionFiles!("sess_b")).toEqual([
      expect.objectContaining({ name: "keep.txt", bytes: 7 }),
    ]);
    // 已删除的会话再次删除返回 0，不报错。
    expect(await files.removeSession("sess_a")).toBe(0);
  });

  it("rejects session ids that would escape the storage root", async () => {
    const { files } = await setup();
    for (const id of ["../db", "a/b", "a\\b", "", "..", "."]) {
      await expect(files.removeSession(id)).rejects.toThrow("session-data.invalid-session-id");
    }
  });

  it("does not follow a symlinked session folder out of the storage root", async () => {
    const { root, cli, files, write } = await setup();
    const outside = join(root, "outside");
    await write(join(outside, "precious.txt"), 50);
    await mkdir(join(cli, "artifacts"), { recursive: true });
    await symlink(outside, join(cli, "artifacts", "sess_link"));
    expect(await files.removeSession("sess_link")).toBe(0);
    expect((await stat(join(outside, "precious.txt"))).size).toBe(50);
  });
  it("保留引用附件时仍删除其余会话文件，重试保持幂等", async () => {
    const { cli, files, write } = await setup();
    await write(join(cli, "artifacts", "sess_a", "call-tool-result-shared.png"), 7);
    await write(join(cli, "artifacts", "sess_a", "call-tool-result-private.png"), 11);
    await write(join(cli, "exec", "sess_a", "output.txt"), 13);
    const manifest = await files.listSessionFiles!("sess_a");
    expect(manifest.map((file) => file.name)).toContain("call-tool-result-shared.png");
    expect(await files.removeSession("sess_a", ["tool-result-shared"])).toBe(24);
    expect(await readdir(join(cli, "artifacts", "sess_a"))).toEqual([
      "call-tool-result-shared.png",
    ]);
    expect(await files.removeSession("sess_a", ["tool-result-shared"])).toBe(0);
  });
});
