import assert from "node:assert/strict";
import test from "node:test";
import { taskBelongsToProject } from "../src/lib/projectTaskMembership.js";
import type { ZCodeTaskMeta } from "@zcode/shared";
import { buildTaskListCacheDescriptor } from "../src/lib/taskQueryCache.js";
import { useTaskQueryCacheStore } from "../src/store/taskQueryCacheStore.js";

const project = {
  id: "project-a",
  name: "Project A",
  folders: [{ id: "new", workspacePath: "/new" }],
  primaryFolderId: "new",
  legacyWorkspaceScopes: [{ workspacePath: "/old" }],
  taskWorkspaceScopes: [{ workspacePath: "/old" }, { workspacePath: "/new" }],
};

test("更换或移除源目录后保留本项目任务，不认领附加目录的其他任务", () => {
  assert.equal(taskBelongsToProject(project, { workspacePath: "/old" }), true);
  assert.equal(taskBelongsToProject(project, { workspacePath: "/new" }), false);
  assert.equal(
    taskBelongsToProject(project, { projectId: "project-a", workspacePath: "/old" }),
    true,
  );
  assert.equal(
    taskBelongsToProject(project, { projectId: "project-b", workspacePath: "/old" }),
    false,
  );
});

test("项目任务不能按相同路径跨远程身份匹配", () => {
  assert.equal(
    taskBelongsToProject(project, {
      projectId: "project-a",
      workspacePath: "/old",
      workspaceIdentity: "remote:other:/old",
    }),
    false,
  );
});

test("同工作目录的另一项目任务取消归档后，不进入本项目缓存", () => {
  const cache = useTaskQueryCacheStore.getState();
  cache.clearAll();
  cache.setQueryResult({
    queryKey: "project-a",
    descriptor: buildTaskListCacheDescriptor({
      project,
      kind: "workspace",
      workspaceScopes: project.taskWorkspaceScopes,
      sortBy: "updated",
      expanded: false,
      visibleLimit: 5,
    }),
    items: [],
    total: 0,
    hasMore: false,
  });
  const task = {
    taskId: "task-b",
    traceId: "trace-b",
    projectId: "project-b",
    workspacePath: "/new",
    title: "Another project",
    mode: "edit",
    createdAt: 1,
    updatedAt: 2,
  } as ZCodeTaskMeta;
  cache.applyTaskMutation({
    previousTask: task,
    nextTask: task,
    previousState: { archived: true, pinned: false },
    nextState: { archived: false, pinned: false },
  });
  const result = useTaskQueryCacheStore.getState().resultsByQueryKey["project-a"]!;
  assert.equal(result.total, 0);
  assert.deepEqual(result.taskKeys, []);
  cache.clearAll();
});
