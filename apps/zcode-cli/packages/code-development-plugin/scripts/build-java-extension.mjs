import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readdir, rm } from "node:fs/promises";
import { delimiter, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const { values } = parseArgs({
  options: {
    "jdtls-home": { type: "string" },
    "java-home": { type: "string" },
  },
});
if (!values["jdtls-home"] || !values["java-home"]) {
  throw new Error("Provide --jdtls-home and --java-home (the locked Java 25 JDK).");
}

const javaHome = resolve(values["java-home"]);
const pluginsPath = resolve(values["jdtls-home"], "plugins");
const pluginJars = (await readdir(pluginsPath)).filter((entry) => entry.endsWith(".jar"));
if (!pluginJars.includes("org.eclipse.jdt.ls.core_1.62.0.202610131109.jar")) {
  throw new Error("The extension must be built against JDT LS 1.62.0.202610131109.");
}
const javaSource = join(packageRoot, "java");
const outputRoot = join(packageRoot, "dist", "java");
await mkdir(outputRoot, { recursive: true });
const buildRoot = await mkdtemp(join(outputRoot, ".build-"));
const outputJar = join(outputRoot, "zcode-java-extension.jar");

async function run(tool, arguments_) {
  const executable = join(javaHome, "bin", `${tool}${process.platform === "win32" ? ".exe" : ""}`);
  await new Promise((resolveRun, rejectRun) => {
    const child = spawn(executable, arguments_, { stdio: "inherit", windowsHide: true });
    child.once("error", rejectRun);
    child.once("exit", (code) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${tool} exited with code ${code}`));
    });
  });
}

try {
  await run("javac", [
    "--release",
    "25",
    "-encoding",
    "UTF-8",
    "-classpath",
    pluginJars.map((entry) => join(pluginsPath, entry)).join(delimiter),
    "-d",
    buildRoot,
    join(javaSource, "src", "com", "zcode", "java", "DiagnosticsSnapshotHandler.java"),
  ]);
  await run("jar", [
    "--create",
    "--date",
    "1980-01-01T00:00:02Z",
    "--file",
    outputJar,
    "--manifest",
    join(javaSource, "META-INF", "MANIFEST.MF"),
    "-C",
    buildRoot,
    ".",
    "-C",
    javaSource,
    "plugin.xml",
  ]);
  process.stdout.write(`Built ${outputJar}\n`);
} finally {
  const buildRelativePath = relative(outputRoot, buildRoot);
  if (buildRelativePath.startsWith(".build-") && !buildRelativePath.includes("..")) {
    await rm(buildRoot, { recursive: true, force: true });
  }
}
