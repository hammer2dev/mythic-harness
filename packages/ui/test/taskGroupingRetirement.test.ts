import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceSlice } from "../src/store/zcodeSessionStoreWorkspaceSlice.js";
import { getWorkspaceState } from "../src/store/zcodeSessionStoreSelectors.js";
import type { ZCodeSessionStoreState } from "../src/store/zcodeSessionStoreTypes.js";
import { isPendingCommandForWorkspace } from "../src/v4/pendingCommandWorkspace.js";
import { sessionCreateTelemetrySchema } from "../../shared/src/sessionCreateTelemetry.js";

test("退役分组后项目新建仍继承模型配置，并按 workspace identity 隔离草稿", () => {
  let state = { workspaces: {} } as ZCodeSessionStoreState;
  const slice = createWorkspaceSlice((partial) => {
    state = { ...state, ...(typeof partial === "function" ? partial(state) : partial) };
  });
  const path = "/example/project";
  const identity = "example-remote-workspace";
  const current = getWorkspaceState(state, path, identity);
  const configOptions = [
    {
      id: "model",
      category: "model",
      name: "Model",
      type: "select" as const,
      currentValue: "example-model",
      options: [{ value: "example-model", name: "Example model" }],
    },
  ];
  state.workspaces[identity] = {
    ...current,
    activeTaskId: "existing-task",
    configOptions,
    configOptionsStatus: "ready",
    draftSessionId: "old-prewarm",
    taskConfigOptionsByTaskId: { "existing-task": configOptions },
  };

  slice.startDraft!(path, undefined, identity, { createSource: "project" });
  const draft = getWorkspaceState(state, path, identity);
  assert.equal(draft.activeTaskId, null);
  assert.equal(draft.draftCreateSource, "project");
  assert.equal(draft.draftSessionId, null);
  assert.deepEqual(draft.configOptions, configOptions);
  assert.notEqual(draft.configOptions, configOptions);
  assert.equal(draft.draftFocusVersion, current.draftFocusVersion + 1);

  slice.startDraft!(path);
  assert.equal(getWorkspaceState(state, path).draftCreateSource, "session");
  assert.equal(getWorkspaceState(state, path, identity), draft);
});

test("旧分组草稿的待确认命令仍按原 workspace 恢复，不改变远程身份边界", () => {
  const entry = {
    clientContext: {
      workspace: { workspacePath: "/example/project", workspaceIdentity: "example-remote" },
      groupedDraftTask: { placement: { type: "group", groupId: "retired-group" } },
    },
    replay: { kind: "input" as const, type: "createSession", payload: {} },
  };
  assert.equal(isPendingCommandForWorkspace(entry, "/example/project", "example-remote"), true);
  assert.equal(isPendingCommandForWorkspace(entry, "/example/project"), false);
});

test("新建遥测仅接受现有项目与独立任务入口", () => {
  const sourceSchema = sessionCreateTelemetrySchema.shape.eventExtraDetail.shape.create_source;
  assert.equal(sourceSchema.parse("project"), "project");
  assert.equal(sourceSchema.parse("session"), "session");
  assert.equal(sourceSchema.safeParse("group").success, false);
});
