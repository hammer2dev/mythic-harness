import assert from "node:assert/strict";
import test from "node:test";
import { createWorkspaceProject } from "../src/lib/workspaceProject.js";
import { resolveProjectGitFolder } from "../src/lib/projectGitSelection.js";
import { resolveProjectNavigationTarget } from "../src/lib/projectNavigationTarget.js";
import { createTabStore, isWorkspaceTab } from "../src/store/tabStore.js";
import { buildRemoteWorkspaceIdentity } from "@zcode/shared";
import {
  increaseWorkspaceTaskVisibleLimit,
  resolveVisibleWorkspaceTaskKeys,
  retainWorkspaceTaskVisibleLimits,
} from "../src/lib/workspaceTaskPagination.js";

test("项目共享主目录时分页仍按项目隔离，收起后只回收不可见项目的分页", () => {
  const first = createWorkspaceProject({ workspacePath: "/work/main" }, "产品");
  const second = createWorkspaceProject({ workspacePath: "/work/main" }, "参考");
  const workspaces = [
    { workspacePath: "/work/main", project: first },
    { workspacePath: "/work/main", project: second },
  ];
  const visible = resolveVisibleWorkspaceTaskKeys({
    enabled: true,
    expandedWorkspacePaths: new Set(["/work/main"]),
    workspaces,
  });
  assert.deepEqual(visible, new Set([first.id, second.id]));
  const limits = increaseWorkspaceTaskVisibleLimit({}, first.id);
  assert.equal(limits[first.id], 10);
  assert.equal(limits[second.id], undefined);
  assert.deepEqual(retainWorkspaceTaskVisibleLimits(limits, visible), limits);
  assert.deepEqual(
    retainWorkspaceTaskVisibleLimits(
      limits,
      resolveVisibleWorkspaceTaskKeys({
        enabled: true,
        expandedWorkspacePaths: new Set(),
        workspaces,
      }),
    ),
    {},
  );
});

test("Git 根目录选择不改变任务工作目录，切换项目或移除选中根后使用当前项目主目录", () => {
  const project = createWorkspaceProject({ workspacePath: "/work/main" }, "产品");
  const attachment = { id: "attachment", workspacePath: "/work/reference" };
  project.folders.push(attachment);
  const currentTaskFolder = { id: "task", workspacePath: "/work/old-main" };
  const selection = { projectId: project.id, folderId: attachment.id };
  assert.equal(resolveProjectGitFolder(project, selection, currentTaskFolder), attachment);
  assert.equal(currentTaskFolder.workspacePath, "/work/old-main");

  const other = createWorkspaceProject({ workspacePath: "/other/main" }, "另一项目");
  assert.equal(resolveProjectGitFolder(other, selection, currentTaskFolder), other.folders[0]);
  project.folders = project.folders.filter((folder) => folder.id !== attachment.id);
  assert.equal(resolveProjectGitFolder(project, selection, currentTaskFolder), project.folders[0]);
});

test("侧栏预选项目在同主目录导航中保持归属，显式任务归属与旧远程执行目录优先", () => {
  const store = createTabStore(null);
  const firstId = store.getState().addTab("/first");
  const secondId = store.getState().addTab("/second");
  store.getState().updateProject(firstId, {
    name: "项目一",
    folders: [{ id: "shared-one", workspacePath: "/shared" }],
    primaryFolderId: "shared-one",
  });
  store.getState().updateProject(secondId, {
    name: "项目二",
    folders: [{ id: "shared-two", workspacePath: "/shared" }],
    primaryFolderId: "shared-two",
  });
  store.getState().activateProjectTask(secondId, { workspacePath: "/shared" });
  const target = resolveProjectNavigationTarget(store.getState(), { workspacePath: "/shared" });
  assert.equal(target?.tab.id, secondId);
  store.getState().activateProjectTask(target!.tab.id, target!.scope);
  assert.equal(store.getState().activeTabId, secondId);
  assert.equal(store.getState().tabs.length, 2);
  const first = store.getState().tabs.find((tab) => tab.id === firstId);
  assert.ok(first && isWorkspaceTab(first));
  assert.equal(
    resolveProjectNavigationTarget(store.getState(), { workspacePath: "/first" }, first.project!.id)
      ?.tab.id,
    firstId,
  );

  const remoteTarget = { kind: "ssh" as const, host: "example.test", username: "dev" };
  const oldIdentity = buildRemoteWorkspaceIdentity("/old", remoteTarget);
  const remoteId = store.getState().addTab("/old", {
    remoteTarget,
    workspaceIdentity: oldIdentity,
    remoteSessionId: "attachment",
  });
  store.getState().updateProject(remoteId, {
    name: "远程项目",
    folders: [{ id: "new", workspacePath: "/new" }],
    primaryFolderId: "new",
  });
  const remote = resolveProjectNavigationTarget(store.getState(), {
    workspacePath: "/old",
    workspaceIdentity: oldIdentity,
  });
  assert.equal(remote?.tab.id, remoteId);
  assert.equal(remote?.tab.remoteSessionId, "attachment");
  assert.equal(remote?.scope.workspaceIdentity, oldIdentity);
  assert.equal(remote?.scope.workspacePath, "/old");
});
