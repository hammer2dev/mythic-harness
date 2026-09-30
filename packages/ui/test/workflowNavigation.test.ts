import assert from "node:assert/strict";
import test from "node:test";
import {
  createTaskNavigationHistory,
  goBack,
  goForward,
  isAutomationsNavEntry,
  isWorkflowsNavEntry,
  pushAutomationsNavEntry,
  pushNavEntry,
  pushWorkflowsNavEntry,
  removeTaskFromHistory,
} from "../src/lib/taskNavigationHistory.js";

test("定时任务和工作流分别入栈，返回定时任务不继承工作流标签", () => {
  let history = createTaskNavigationHistory();
  history = pushAutomationsNavEntry(history, "/project", undefined, "timer", "idle");
  history = pushWorkflowsNavEntry(history, "/project");
  history = pushAutomationsNavEntry(history, "/project");

  assert.deepEqual(
    history.entries.map((entry) => entry.kind),
    ["automations", "workflows", "automations"],
  );
  const timer = history.entries[0]!;
  assert.ok(isAutomationsNavEntry(timer));
  assert.equal(timer.automationTab, "idle");
  assert.deepEqual(history.entries[2], { kind: "automations", workspacePath: "/project" });
});

test("旧 workflow 标签映射独立工作流入口，并与新入口去重", () => {
  const legacy = pushAutomationsNavEntry(
    createTaskNavigationHistory(),
    "/project",
    undefined,
    undefined,
    "workflow",
  );
  assert.deepEqual(legacy.entries, [{ kind: "workflows", workspacePath: "/project" }]);
  assert.equal(pushWorkflowsNavEntry(legacy, "/project"), legacy);
});

test("前进后退恢复工作流与定时任务各自的远端身份", () => {
  let history = pushAutomationsNavEntry(createTaskNavigationHistory(), "/shared");
  history = pushWorkflowsNavEntry(history, "/shared", "remote-a");
  history = pushAutomationsNavEntry(history, "/shared", "remote-b", "timer", "scheduled");

  const back = goBack(history)!;
  assert.ok(isWorkflowsNavEntry(back.entry));
  assert.equal(back.entry.workspaceIdentity, "remote-a");
  const local = goBack(back.history)!;
  assert.ok(isAutomationsNavEntry(local.entry));
  assert.equal(local.entry.workspaceIdentity, undefined);
  const forward = goForward(goForward(local.history)!.history)!;
  assert.ok(isAutomationsNavEntry(forward.entry));
  assert.equal(forward.entry.workspaceIdentity, "remote-b");
  assert.equal(forward.entry.automationId, "timer");
});

test("删除聊天历史仍保留工作流入口，后退后新导航清除原前进路径", () => {
  let history = pushNavEntry(createTaskNavigationHistory(), "/project", "removed-task");
  history = pushWorkflowsNavEntry(history, "/project", "remote-a");
  history = pushWorkflowsNavEntry(history, "/project", "remote-b");
  history = removeTaskFromHistory(history, "removed-task");
  assert.equal(history.entries.length, 2);
  assert.equal(history.cursor, 1);

  const back = goBack(history)!;
  const next = pushAutomationsNavEntry(back.history, "/project");
  assert.deepEqual(
    next.entries.map((entry) => entry.kind),
    ["workflows", "automations"],
  );
  assert.equal(next.entries[0]!.workspaceIdentity, "remote-a");
  assert.equal(goForward(next), null);
});
