import assert from "node:assert/strict";
import test from "node:test";
import { appSettingsSchema, buildRemoteWorkspaceIdentity } from "@zcode/shared";
import { createTabStore, isWorkspaceTab } from "../src/store/tabStore.js";
import { buildPersistedWorkspaceSessionEntries } from "../src/lib/remoteWorkspaceHistory.js";
import { restorePersistedRemoteWorkspaceSessions } from "../src/root/remoteWorkspaceSessionPersistence.js";
import { createSidebarSectionsStore } from "../src/store/sidebarSectionsStore.js";
import { resolveRootWorkspaceShellTarget } from "../src/root/rootWorkspaceShellTarget.js";
import { buildRemoteWorkspacePersistPatch } from "../src/root/remoteWorkspaceSessionPersistence.js";

function workspace(store: ReturnType<typeof createTabStore>) {
  const tab = store.getState().tabs.find(isWorkspaceTab);
  assert.ok(tab?.project);
  return tab;
}

test("旧项目迁移并切换主目录后，保留项目身份和历史任务执行目录", () => {
  const store = createTabStore(null);
  const tabId = store.getState().addTab("/app");
  const original = workspace(store);
  const projectId = original.project!.id;
  store.getState().updateProject(tabId, {
    name: "应用与文档",
    folders: [...original.project!.folders, { id: "docs", workspacePath: "/docs" }],
    primaryFolderId: "docs",
  });
  const updated = workspace(store);
  assert.equal(updated.project!.id, projectId);
  assert.equal(updated.workspacePath, "/docs");
  assert.equal(updated.label, "应用与文档");
  assert.deepEqual(updated.project!.legacyWorkspaceScopes, [{ workspacePath: "/app" }]);
  assert.deepEqual(updated.project!.taskWorkspaceScopes, [
    { workspacePath: "/app" },
    { workspacePath: "/docs" },
  ]);
  store.getState().activateProjectTask(tabId, { workspacePath: "/app" });
  assert.equal(store.getState().activeTabId, tabId);
  assert.equal(store.getState().activeWorkspacePath, "/app");
  assert.equal(store.getState().tabs.length, 1);
  assert.equal(
    resolveRootWorkspaceShellTarget({
      activeWorkspaceTab: updated,
      activeWorkspacePath: store.getState().activeWorkspacePath,
      activeWorkspaceIdentity: store.getState().activeWorkspaceIdentity,
      workspaceTabs: [updated],
    }).workspaceShellPath,
    "/app",
  );
  store.getState().activateTab(tabId);
  assert.equal(store.getState().activeWorkspacePath, "/docs");
});

test("目录移除和重启恢复保留项目配置及过去的任务归属", () => {
  const store = createTabStore(null);
  const tabId = store.getState().addTab("/app");
  store.getState().updateProject(tabId, {
    name: "文档项目",
    folders: [{ id: "docs", workspacePath: "/docs" }],
    primaryFolderId: "docs",
  });
  const entries = buildPersistedWorkspaceSessionEntries(store.getState().tabs, new Map());
  const restored = createTabStore(null);
  restorePersistedRemoteWorkspaceSessions({
    settings: appSettingsSchema.parse({ lastWorkspaceSession: entries }),
    tabStoreApi: restored,
  });
  assert.deepEqual(workspace(restored).project, workspace(store).project);
  assert.equal(workspace(restored).label, "文档项目");
  assert.equal(workspace(restored).project!.legacyWorkspaceScopes[0]!.workspacePath, "/app");
});

test("远程项目切换主目录后仍保存同一环境的配置和凭据快照", () => {
  const target = { kind: "ssh" as const, host: "example.test", username: "dev" };
  const identity = buildRemoteWorkspaceIdentity("/app", target);
  const store = createTabStore(null);
  const tabId = store
    .getState()
    .addTab("/app", { workspaceIdentity: identity, remoteTarget: target });
  store.getState().updateProject(tabId, {
    name: "远程项目",
    folders: [{ id: "docs", workspacePath: "/docs" }],
    primaryFolderId: "docs",
  });
  const patch = buildRemoteWorkspacePersistPatch(store.getState(), [
    {
      kind: "remote",
      workspacePath: "/app",
      workspaceIdentity: identity,
      target,
      lastOpenedAt: 1,
      lastConnectionStatus: "connected",
    },
  ]);
  assert.equal(patch.lastWorkspaceSession?.length, 1);
  const restored = createTabStore(null);
  restorePersistedRemoteWorkspaceSessions({
    settings: appSettingsSchema.parse(patch),
    tabStoreApi: restored,
  });
  assert.deepEqual(workspace(restored).project, workspace(store).project);
  assert.equal(
    workspace(restored).workspaceIdentity,
    buildRemoteWorkspaceIdentity("/docs", target),
  );
  restored.getState().addTab("/docs");
  assert.equal(restored.getState().tabs.length, 2);
  const local = workspace(restored);
  assert.throws(
    () =>
      restored.getState().updateProject(local.id, {
        name: "混合环境",
        folders: [{ id: "remote", workspacePath: "/app", workspaceIdentity: identity }],
        primaryFolderId: "remote",
      }),
    /同一执行环境/,
  );
});

test("项目分区只迁移一次到稳定项目ID，主目录更换不会丢失分区", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
  const sections = createSidebarSectionsStore(storage);
  const sectionId = sections.getState().createSection("工作", "/app");
  sections.getState().migrateProjectKey("project-a", ["/app"]);
  assert.equal(sections.getState().projectSectionByWorkspaceKey["project-a"], sectionId);
  sections.getState().moveProject("project-a", "projects");
  sections.getState().migrateProjectKey("project-a", ["/app"]);
  assert.equal(sections.getState().projectSectionByWorkspaceKey["project-a"], undefined);
  assert.equal(sections.getState().projectSectionByWorkspaceKey["/app"], undefined);
});

test("移除并重启后重新添加历史主目录，恢复同一项目及任务归属", () => {
  const store = createTabStore(null);
  const tabId = store.getState().addTab("/app");
  store.getState().updateProject(tabId, {
    name: "保存的项目",
    folders: [{ id: "docs", workspacePath: "/docs" }],
    primaryFolderId: "docs",
  });
  const project = workspace(store).project;
  store.getState().closeTab(tabId);
  assert.equal(store.getState().tabs.length, 0);
  assert.deepEqual(store.getState().closedProjects, [project]);
  const restored = createTabStore(null);
  restorePersistedRemoteWorkspaceSessions({
    settings: appSettingsSchema.parse(buildRemoteWorkspacePersistPatch(store.getState(), [])),
    tabStoreApi: restored,
  });
  restored.getState().addTab("/app");
  assert.deepEqual(workspace(restored).project, project);
  assert.equal(restored.getState().activeWorkspacePath, "/docs");
  assert.deepEqual(restored.getState().closedProjects, []);
  restored.getState().addTab("/app");
  assert.equal(restored.getState().tabs.length, 1);
});
