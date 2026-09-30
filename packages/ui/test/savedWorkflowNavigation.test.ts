import assert from "node:assert/strict";
import test from "node:test";
import { resolveSavedWorkflowGroupMode } from "../src/settings/saved-workflows/savedWorkflowNavigation.js";

test("工作流详情按范围和 workspace identity 选择，名称相同不串组", () => {
  const selected = {
    mode: "detail" as const,
    scope: "project" as const,
    workspaceKey: "remote-project-one",
    name: "每日汇总",
  };
  assert.deepEqual(resolveSavedWorkflowGroupMode(selected, "project", "remote-project-one"), {
    kind: "detail",
    name: "每日汇总",
  });
  assert.deepEqual(resolveSavedWorkflowGroupMode(selected, "project", "remote-project-two"), {
    kind: "hidden",
  });
  assert.deepEqual(resolveSavedWorkflowGroupMode(selected, "global"), { kind: "hidden" });

  const global = { mode: "detail" as const, scope: "global" as const, name: "每日汇总" };
  assert.deepEqual(resolveSavedWorkflowGroupMode(global, "global"), {
    kind: "detail",
    name: "每日汇总",
  });
  assert.deepEqual(resolveSavedWorkflowGroupMode(global, "project", "remote-project-one"), {
    kind: "hidden",
  });
});

test("返回全部工作流后全局和项目都恢复列表模式", () => {
  const overview = { mode: "list" as const };
  assert.deepEqual(resolveSavedWorkflowGroupMode(overview, "global"), { kind: "list" });
  assert.deepEqual(resolveSavedWorkflowGroupMode(overview, "project", "project-one"), {
    kind: "list",
  });
});
