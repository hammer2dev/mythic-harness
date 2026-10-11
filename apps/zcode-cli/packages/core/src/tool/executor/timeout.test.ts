import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers/promises";
import type { ToolEntry, ToolExecutionContext } from "../types.js";
import { executeWithTimeout, ToolDeadline } from "./timeout.js";

test("协作取消等待已开始的文件提交返回实际部分结果", async () => {
  const controller = new AbortController();
  let finishCommit!: () => void;
  const committing = new Promise<void>((resolve) => {
    finishCommit = resolve;
  });
  const partial = { status: "partial", committedChanges: [{ filePath: "changed.txt" }] };
  let settled = false;
  const result = executeWithTimeout(
    async () => {
      await committing;
      return partial;
    },
    {},
    { abortSignal: controller.signal } as ToolExecutionContext,
    new ToolDeadline(undefined),
    controller,
    { metadata: { name: "ApplyPatch" }, cancellation: { settlement: "afterHandler" } } as ToolEntry,
  ).then(
    (value) => {
      settled = true;
      return value;
    },
    (error: unknown) => {
      settled = true;
      return error;
    },
  );
  controller.abort();
  await setImmediate();
  try {
    assert.equal(settled, false);
  } finally {
    finishCommit();
  }
  assert.equal(await result, partial);
});

test("调用开始前取消不会启动协作提交 handler", async () => {
  const controller = new AbortController();
  controller.abort();
  let started = false;
  await assert.rejects(
    executeWithTimeout(
      async () => {
        started = true;
      },
      {},
      { abortSignal: controller.signal } as ToolExecutionContext,
      new ToolDeadline(undefined),
      controller,
      {
        metadata: { name: "ApplyPatch" },
        cancellation: { settlement: "afterHandler" },
      } as ToolEntry,
    ),
  );
  assert.equal(started, false);
});
