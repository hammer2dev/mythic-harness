import { execFile } from "node:child_process";
import { access, readFile, realpath, stat } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir, tmpdir } from "node:os";
import {
  basename,
  delimiter,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { promisify } from "node:util";
import type { ApplicationDescriptor } from "./catalog.js";
import type { AgentApplicationSource } from "./contract.js";

const windows = process.platform === "win32";
const execute = promisify(execFile);

export interface LocalProgram {
  path: string;
  file: string;
  args: string[];
  source: AgentApplicationSource;
  version: string | null;
  prefix?: string;
}

function executableDirectories(): string[] {
  return [
    ...new Set(
      [
        ...(process.env.PATH ?? "").split(delimiter).map((dir) => dir.replace(/^"|"$/g, "")),
        ...(windows && process.env.APPDATA ? [join(process.env.APPDATA, "npm")] : []),
        join(homedir(), ".local", "bin"),
        ...(!windows ? ["/usr/local/bin", "/opt/homebrew/bin"] : []),
      ].filter((dir) => isAbsolute(dir)),
    ),
  ];
}

async function isFile(file: string, executable = false): Promise<boolean> {
  try {
    if (!(await stat(file)).isFile()) return false;
    if (executable && !windows) await access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function findNode(preferred: string): Promise<string | null> {
  for (const dir of [preferred, ...executableDirectories()]) {
    const file = join(dir, windows ? "node.exe" : "node");
    if (await isFile(file, true)) return file;
  }
  return null;
}

async function readPackageJson(path: string): Promise<{
  name?: unknown;
  version?: unknown;
  bin?: string | Record<string, unknown>;
}> {
  return JSON.parse(await readFile(path, "utf8"));
}

async function npmProgram(
  app: ApplicationDescriptor,
  launcher: string,
): Promise<LocalProgram | null> {
  if (!app.packageName || !app.command) return null;
  const expectedName = windows ? `${app.command}.cmd` : app.command;
  if (basename(launcher).toLowerCase() !== expectedName) return null;
  const binDir = dirname(launcher);
  const prefix = windows ? binDir : dirname(binDir);
  const directory = join(prefix, ...(windows ? [] : ["lib"]), "node_modules", app.packageName);
  try {
    const manifest = await readPackageJson(join(directory, "package.json"));
    if (manifest.name !== app.packageName || typeof manifest.version !== "string") return null;
    const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[app.command];
    if (typeof bin !== "string") return null;
    const entry = resolve(directory, bin);
    const withinPackage = relative(directory, entry);
    if (isAbsolute(withinPackage) || withinPackage.startsWith("..") || !(await isFile(entry)))
      return null;
    if (windows) {
      const contents = (await readFile(launcher, "utf8")).replaceAll("\\", "/");
      if (!contents.includes(`/node_modules/${app.packageName}/`)) return null;
    } else if ((await realpath(launcher)) !== (await realpath(entry))) {
      return null;
    }
    if ([".js", ".cjs", ".mjs"].includes(extname(entry).toLowerCase())) {
      const node = await findNode(binDir);
      if (!node) return null;
      return {
        path: launcher,
        file: node,
        args: [entry],
        source: "npm",
        prefix,
        version: manifest.version,
      };
    }
    if (windows && extname(entry).toLowerCase() !== ".exe") return null;
    if (!(await isFile(entry, true))) return null;
    return {
      path: launcher,
      file: entry,
      args: [],
      source: "npm",
      prefix,
      version: manifest.version,
    };
  } catch {
    return null;
  }
}

export async function locateProgram(
  app: ApplicationDescriptor,
  launcher: string,
): Promise<LocalProgram | null> {
  if (!isAbsolute(launcher) || !(await isFile(launcher, true))) return null;
  const npm = await npmProgram(app, launcher);
  if (npm) return npm;
  if (windows && extname(launcher).toLowerCase() !== ".exe") return null;
  return { path: launcher, file: launcher, args: [], source: "native", version: null };
}

export async function discoverProgram(app: ApplicationDescriptor): Promise<LocalProgram | null> {
  if (!app.command) return null;
  for (const directory of executableDirectories()) {
    for (const ext of windows ? [".cmd", ".exe"] : [""]) {
      const program = await locateProgram(app, join(directory, app.command + ext));
      if (program) return program;
    }
  }
  return null;
}

export async function inspectVersion(
  program: LocalProgram,
  signal: AbortSignal,
  launchArgs: readonly string[] = [],
): Promise<string | null> {
  if (program.version) return program.version;
  try {
    const { stdout, stderr } = await execute(
      program.file,
      [...program.args, ...launchArgs, "--version"],
      { cwd: tmpdir(), signal, windowsHide: true, timeout: 5000, maxBuffer: 64 * 1024 },
    );
    return (
      (stdout || stderr).match(/\b\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?\b/)?.[0] ??
      null
    );
  } catch {
    signal.throwIfAborted();
    return null;
  }
}

async function npmCli(): Promise<{ node: string; file: string }> {
  for (const directory of executableDirectories()) {
    const file = windows
      ? join(directory, "node_modules", "npm", "bin", "npm-cli.js")
      : await realpath(join(directory, "npm")).catch(() => "");
    if (basename(file) !== "npm-cli.js" || !(await isFile(file))) continue;
    const node = await findNode(directory);
    if (node) return { node, file };
  }
  throw new Error("Node.js and npm are required to maintain this installation.");
}

export async function changeNpmInstallation(
  app: ApplicationDescriptor,
  program: LocalProgram,
  version: string | null,
  signal: AbortSignal,
): Promise<void> {
  if (!program.prefix || !app.packageName)
    throw new Error("Use the program's original installation channel for this action.");
  const { node, file } = await npmCli();
  const args = version
    ? ["install", "--global", "--prefix", program.prefix, `${app.packageName}@${version}`]
    : ["uninstall", "--global", "--prefix", program.prefix, app.packageName];
  try {
    await execute(node, [file, ...args], {
      cwd: tmpdir(),
      signal,
      windowsHide: true,
      maxBuffer: 256 * 1024,
    });
  } catch (error) {
    signal.throwIfAborted();
    const stderr = (error as { stderr?: string }).stderr;
    if (stderr?.includes("EBUSY"))
      throw new Error("The program is in use. Close it and try again.");
    throw new Error("npm failed. Check the npm configuration and try again.", { cause: error });
  }
}
