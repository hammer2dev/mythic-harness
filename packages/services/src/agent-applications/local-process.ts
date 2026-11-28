import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import {
  shouldSpawnInDetachedProcessGroup,
  terminateProcessTreeAndWait,
} from "#src/process/processTreeTerminator.js";

export function startApplicationProcess(
  file: string,
  args: readonly string[],
  cwd: string,
  env?: NodeJS.ProcessEnv,
): ChildProcessWithoutNullStreams {
  return spawn(file, args, {
    cwd,
    ...(env ? { env } : {}),
    stdio: "pipe",
    windowsHide: true,
    detached: shouldSpawnInDetachedProcessGroup(),
  });
}

export async function stopApplicationProcess(
  child: ChildProcessWithoutNullStreams,
  startedAt: number,
): Promise<void> {
  child.stdin.destroy();
  child.stdout.destroy();
  child.stderr.destroy();
  await terminateProcessTreeAndWait(child, {
    ...(shouldSpawnInDetachedProcessGroup() && child.pid ? { ownedProcessGroupId: child.pid } : {}),
    ownedProcessStartedAtMs: startedAt,
  });
}

export async function withApplicationProcess<T>(
  file: string,
  args: readonly string[],
  cwd: string,
  signal: AbortSignal,
  run: (child: ChildProcessWithoutNullStreams) => Promise<T>,
): Promise<T> {
  signal.throwIfAborted();
  const startedAt = Date.now();
  const child = startApplicationProcess(file, args, cwd);
  child.stderr.resume();
  child.stdin.on("error", () => undefined);
  let abort: () => void = () => undefined;
  const stopped = new Promise<never>((_, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
    child.once("error", (cause) =>
      reject(new Error("The Agent program could not be started.", { cause })),
    );
    child.once("close", () => reject(new Error("The Agent exited before completing the request.")));
  });
  try {
    return await Promise.race([run(child), stopped]);
  } finally {
    signal.removeEventListener("abort", abort);
    await stopApplicationProcess(child, startedAt);
  }
}
