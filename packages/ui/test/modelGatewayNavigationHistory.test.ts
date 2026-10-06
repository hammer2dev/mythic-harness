import assert from "node:assert/strict";
import test from "node:test";
import {
  createTaskNavigationHistory,
  goBack,
  goForward,
  isModelGatewayNavEntry,
  pushModelGatewayNavEntry,
  pushNavEntry,
  pushPluginStoreNavEntry,
} from "../src/lib/taskNavigationHistory.js";

test("模型设置与统计分别入栈，前后导航恢复供应商及工作区身份", () => {
  let history = pushNavEntry(createTaskNavigationHistory(), "/shared", "task", "remote-a");
  history = pushModelGatewayNavEntry(history, "/shared", "remote-a", {
    section: "modelProvider",
    providerId: "custom-provider",
  });
  history = pushModelGatewayNavEntry(history, "/shared", "remote-a", { section: "usage" });

  const back = goBack(history)!;
  assert.ok(isModelGatewayNavEntry(back.entry));
  assert.equal(back.entry.section, "modelProvider");
  assert.equal(back.entry.providerId, "custom-provider");
  assert.equal(back.entry.workspaceIdentity, "remote-a");
  const task = goBack(back.history)!;
  assert.equal(task.entry.kind, "task");
  const forward = goForward(goForward(task.history)!.history)!;
  assert.ok(isModelGatewayNavEntry(forward.entry));
  assert.equal(forward.entry.section, "usage");
  assert.equal(forward.entry.workspaceIdentity, "remote-a");
  assert.equal(forward.history.entries, history.entries);
});

test("网关同目标相邻去重，供应商或工作区身份变化仍是独立目标", () => {
  const initial = pushModelGatewayNavEntry(createTaskNavigationHistory(), "/shared");
  assert.equal(
    pushModelGatewayNavEntry(initial, "/shared", undefined, { section: "modelProvider" }),
    initial,
  );
  let history = pushModelGatewayNavEntry(initial, "/shared", undefined, {
    section: "modelProvider",
    providerId: "custom-a",
  });
  history = pushModelGatewayNavEntry(history, "/shared", undefined, {
    section: "modelProvider",
    providerId: "custom-b",
  });
  history = pushModelGatewayNavEntry(history, "/shared", "remote-a", {
    section: "modelProvider",
    providerId: "custom-b",
  });
  assert.equal(history.entries.length, 4);
});

test("后退后进入其他模块沿用原历史分支截断语义", () => {
  let history = pushModelGatewayNavEntry(createTaskNavigationHistory(), "/project");
  history = pushModelGatewayNavEntry(history, "/project", undefined, { section: "usage" });
  const back = goBack(history)!;
  const next = pushPluginStoreNavEntry(back.history, "/project");
  assert.deepEqual(
    next.entries.map((entry) => entry.kind),
    ["model-gateway", "plugin-store"],
  );
  assert.equal(goForward(next), null);
});
