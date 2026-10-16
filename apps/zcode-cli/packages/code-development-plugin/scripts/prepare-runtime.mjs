import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { Agent, get } from "node:https";
import { dirname, isAbsolute, join, posix, relative, resolve, sep } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const scriptPath = fileURLToPath(import.meta.url);
const packageRoot = resolve(dirname(scriptPath), "..");
const runtimeRoot = join(packageRoot, "runtime");
const hostTarget = `${process.platform}-${process.arch}`;
const tarExecutable =
  process.platform === "win32"
    ? join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe")
    : "tar";
const resources = JSON.parse(await readFile(join(packageRoot, "resources.json"), "utf8"));

function assertChild(root, path) {
  const child = relative(resolve(root), resolve(path));
  if (!child || child === ".." || child.startsWith(`..${sep}`) || isAbsolute(child)) {
    throw new Error(`Path is outside the intended build directory: ${path}`);
  }
}

async function removeChild(root, path) {
  assertChild(root, path);
  await rm(path, { force: true, recursive: true });
}

async function run(executable, arguments_, { cwd, capture = false } = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(executable, arguments_, {
      cwd,
      windowsHide: true,
      stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit",
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (data) => {
      stdout += data.toString();
    });
    child.stderr?.on("data", (data) => {
      stderr += data.toString();
    });
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code === 0) resolveRun(stdout);
      else rejectRun(new Error(`${executable} exited with ${code}: ${stderr}`));
    });
  });
}

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function download(url, destination, redirects = 0) {
  if (redirects > 5 || !url.startsWith("https://")) throw new Error("Invalid resource redirect");
  await new Promise((resolveDownload, rejectDownload) => {
    const agent = new Agent({ proxyEnv: process.env });
    const request = get(url, { agent }, async (response) => {
      try {
        if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
          response.resume();
          await download(new URL(response.headers.location, url).href, destination, redirects + 1);
        } else {
          if (response.statusCode !== 200)
            throw new Error(`Resource HTTP status ${response.statusCode}`);
          await pipeline(response, createWriteStream(destination));
        }
        resolveDownload();
      } catch (error) {
        rejectDownload(error);
      } finally {
        agent.destroy();
      }
    });
    request.once("error", rejectDownload);
  });
}

async function cachedResource(resource, cacheDir) {
  const archive = join(cacheDir, resource.file);
  assertChild(cacheDir, archive);
  try {
    await access(archive);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const temporary = `${archive}.download-${process.pid}`;
    try {
      await download(resource.url, temporary);
      if ((await hashFile(temporary)) !== resource.sha256)
        throw new Error(`SHA256 mismatch: ${resource.file}`);
      await rename(temporary, archive);
    } finally {
      assertChild(cacheDir, temporary);
      await rm(temporary, { force: true });
    }
  }
  if ((await hashFile(archive)) !== resource.sha256)
    throw new Error(`Cached SHA256 mismatch: ${resource.file}`);
  return archive;
}

function validateArchivePath(path) {
  if (
    path.startsWith("/") ||
    /^[A-Za-z]:/.test(path) ||
    path.includes("\\") ||
    path.split("/").includes("..")
  )
    throw new Error(`Unsafe archive member: ${path}`);
}

async function extract(archive, destination, buildJavaHome) {
  await mkdir(destination, { recursive: true });
  // Windows bsdtar 支持 zip；其他宿主用已准备的宿主 jar，不能执行交叉目标的 Java。
  const useJar = archive.endsWith(".zip") && process.platform !== "win32";
  const executable = useJar ? join(buildJavaHome, "bin", "jar") : tarExecutable;
  const listing = await run(executable, useJar ? ["tf", archive] : ["-tf", archive], {
    capture: true,
  });
  const members = listing.split(/\r?\n/).filter(Boolean);
  for (const member of members) validateArchivePath(member);
  if (!useJar) {
    const details = (await run(tarExecutable, ["-tvf", archive], { capture: true }))
      .split(/\r?\n/)
      .filter(Boolean);
    for (let index = 0; index < details.length; index++) {
      const detail = details[index];
      if (detail.startsWith("l") || detail.startsWith("h")) {
        const link = /(?: -> | link to )(.*)$/.exec(detail)?.[1];
        if (!link) throw new Error(`Cannot verify archive link: ${members[index]}`);
        if (link.startsWith("/") || /^[A-Za-z]:/.test(link) || link.includes("\\")) {
          throw new Error(`Unsafe archive link: ${link}`);
        }
        const normalized = posix.normalize(
          detail.startsWith("h") ? link : posix.join(posix.dirname(members[index]), link),
        );
        validateArchivePath(normalized);
      } else if (!detail.startsWith("-") && !detail.startsWith("d")) {
        throw new Error(`Unsupported archive member type: ${members[index]}`);
      }
    }
  }
  await run(executable, useJar ? ["xf", archive] : ["-xf", archive, "-C", destination], {
    cwd: destination,
  });
}

function javaResource(target) {
  const asset = resources.java.targets[target];
  if (!asset) throw new Error(`No locked build-host Java for ${target}; provide --build-java-home`);
  return { ...asset, url: `${resources.java.baseUrl}/${asset.file}` };
}

async function prepareBuildJava(cacheDir, configuredHome) {
  if (configuredHome) return resolve(configuredHome);
  const resource = javaResource(hostTarget);
  const archive = await cachedResource(resource, cacheDir);
  const extracted = join(cacheDir, `host-java-${hostTarget}-${resources.java.version}`);
  const javaHome = join(extracted, ...resource.root.split("/"));
  try {
    await access(join(javaHome, "bin", process.platform === "win32" ? "javac.exe" : "javac"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    assertChild(cacheDir, extracted);
    await extract(archive, extracted);
  }
  return javaHome;
}

export async function assertCodeDevelopmentTarget(pluginRoot, target) {
  const manifest = JSON.parse(await readFile(join(pluginRoot, "runtime", "manifest.json"), "utf8"));
  if (manifest.version !== 1 || manifest.target !== target) {
    throw new Error(
      `Code development runtime target mismatch: expected ${target}, got ${manifest.target}`,
    );
  }
  if (manifest.supported !== true && !(manifest.supported === false && target === "win32-arm64")) {
    throw new Error(`Missing Java resources for ${target}`);
  }
  if (manifest.supported) {
    await Promise.all([
      access(join(pluginRoot, "runtime", manifest.java.executable)),
      access(join(pluginRoot, "runtime", "jdtls", manifest.jdtls.configuration, "config.ini")),
      access(join(pluginRoot, "runtime", "lombok.jar")),
      access(join(pluginRoot, "dist", "java", "zcode-java-extension.jar")),
    ]);
  }
  return manifest;
}

export async function stageCodeDevelopmentPlugin(destination, target) {
  await assertCodeDevelopmentTarget(packageRoot, target);
  destination = resolve(destination);
  await mkdir(destination, { recursive: true });
  await removeChild(destination, join(destination, "runtime"));
  for (const entry of [".zcode-plugin", "package.json", "README.md", "resources.json", "runtime"]) {
    await cp(join(packageRoot, entry), join(destination, entry), {
      recursive: true,
      verbatimSymlinks: true,
    });
  }
  if (target !== "win32-arm64") {
    await cp(join(packageRoot, "dist", "java"), join(destination, "dist", "java"), {
      recursive: true,
    });
  } else {
    await removeChild(destination, join(destination, "dist"));
  }
  await assertCodeDevelopmentTarget(destination, target);
}

export async function prepareCodeDevelopmentRuntime({
  target = `${process.env.ZCODE_TARGET_OS || process.platform}-${process.env.ZCODE_TARGET_ARCH || process.arch}`,
  cacheDir = process.env.ZCODE_JAVA_RESOURCE_CACHE || join(packageRoot, ".resource-cache"),
  buildJavaHome = process.env.ZCODE_BUILD_JAVA_HOME,
} = {}) {
  cacheDir = resolve(cacheDir);
  if (target === "win32-arm64") {
    await removeChild(packageRoot, runtimeRoot);
    await mkdir(runtimeRoot, { recursive: true });
    const manifest = {
      version: 1,
      target,
      supported: false,
      reason: "Java language service is not supported on Windows ARM64 in this release",
    };
    await writeFile(join(runtimeRoot, "manifest.json"), JSON.stringify(manifest, null, 2));
    return manifest;
  }
  const targetJava = javaResource(target);
  await mkdir(cacheDir, { recursive: true });
  const hostJava = await prepareBuildJava(cacheDir, buildJavaHome);
  const javac = join(hostJava, "bin", process.platform === "win32" ? "javac.exe" : "javac");
  if (!/^javac 25(?:\.|\s|$)/.test((await run(javac, ["-version"], { capture: true })).trim())) {
    throw new Error("The Java extension requires a build-host Java 25 JDK");
  }
  const [jdtArchive, javaArchive, lombokJar] = await Promise.all([
    cachedResource(resources.jdtls, cacheDir),
    cachedResource(targetJava, cacheDir),
    cachedResource(resources.lombok, cacheDir),
  ]);
  const staging = await mkdtemp(join(packageRoot, ".runtime-build-"));
  try {
    const nextRuntime = join(staging, "runtime");
    const javaExtract = join(staging, "java-extract");
    await extract(jdtArchive, join(nextRuntime, "jdtls"), hostJava);
    await extract(javaArchive, javaExtract, hostJava);
    await cp(join(javaExtract, ...targetJava.root.split("/")), join(nextRuntime, "java"), {
      recursive: true,
      verbatimSymlinks: true,
    });
    await cp(lombokJar, join(nextRuntime, "lombok.jar"));
    await run(process.execPath, [
      join(packageRoot, "scripts", "build-java-extension.mjs"),
      "--jdtls-home",
      join(nextRuntime, "jdtls"),
      "--java-home",
      hostJava,
    ]);
    const extensionJar = join(packageRoot, "dist", "java", "zcode-java-extension.jar");
    const manifest = {
      version: 1,
      target,
      supported: true,
      jdtls: {
        version: resources.jdtls.version,
        sha256: resources.jdtls.sha256,
        path: "jdtls",
        configuration: targetJava.configuration,
      },
      java: {
        version: resources.java.version,
        sha256: targetJava.sha256,
        path: "java",
        executable: `java/bin/java${target.startsWith("win32-") ? ".exe" : ""}`,
      },
      lombok: {
        version: resources.lombok.version,
        sha256: resources.lombok.sha256,
        path: "lombok.jar",
      },
      extension: {
        version: "0.1.0",
        sha256: await hashFile(extensionJar),
        path: "../dist/java/zcode-java-extension.jar",
      },
    };
    await writeFile(join(nextRuntime, "manifest.json"), JSON.stringify(manifest, null, 2));
    await writeFile(join(nextRuntime, "SOURCES.json"), JSON.stringify(resources, null, 2));
    await removeChild(packageRoot, runtimeRoot);
    assertChild(packageRoot, nextRuntime);
    assertChild(packageRoot, runtimeRoot);
    await rename(nextRuntime, runtimeRoot);
    await assertCodeDevelopmentTarget(packageRoot, target);
    return manifest;
  } finally {
    await removeChild(packageRoot, staging);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  const { values } = parseArgs({
    options: {
      target: { type: "string" },
      "cache-dir": { type: "string" },
      "build-java-home": { type: "string" },
    },
  });
  const manifest = await prepareCodeDevelopmentRuntime({
    target: values.target,
    cacheDir: values["cache-dir"],
    buildJavaHome: values["build-java-home"],
  });
  process.stdout.write(
    `Prepared code-development runtime: ${manifest.target} (${manifest.supported ? "supported" : "unsupported"})\n`,
  );
}
