import assert from "node:assert/strict";
import test from "node:test";
import { createSidebarSectionsStore } from "../src/store/sidebarSectionsStore.js";
import { readSidebarTaskPreferences } from "../src/lib/sidebarTaskPreferences.js";

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
}

test("创建、移动、重命名、折叠和排序可恢复，删除分区使项目回到默认区域", () => {
  const storage = createStorage();
  const store = createSidebarSectionsStore(storage);
  const sectionId = store.getState().createSection(" 公司 ", "/project");
  assert.ok(sectionId);
  store.getState().renameSection(sectionId, "工作");
  store.getState().setSectionExpanded(sectionId, false);
  store.getState().reorderSections(sectionId, "projects");
  const restored = createSidebarSectionsStore(storage);
  assert.deepEqual(restored.getState().sections, [{ id: sectionId, name: "工作" }]);
  assert.deepEqual(restored.getState().sectionOrder, ["projects", sectionId, "conversations"]);
  assert.equal(restored.getState().projectSectionByWorkspaceKey["/project"], sectionId);
  assert.equal(restored.getState().expandedBySectionId[sectionId], false);
  restored.getState().removeSection(sectionId);
  assert.deepEqual(restored.getState().sections, []);
  assert.deepEqual(restored.getState().projectSectionByWorkspaceKey, {});
  assert.deepEqual(restored.getState().sectionOrder, ["projects", "conversations"]);
});

test("相同路径的不同项目身份隔离，默认归属不接受独立任务区域", () => {
  const store = createSidebarSectionsStore(createStorage());
  const first = store.getState().createSection("工作")!;
  const second = store.getState().createSection("学习")!;
  store.getState().moveProject("/same/path", first);
  store.getState().moveProject("remote-a:/same/path", second);
  store.getState().moveProject("remote-b:/same/path", first);
  assert.deepEqual(store.getState().projectSectionByWorkspaceKey, {
    "/same/path": first,
    "remote-a:/same/path": second,
    "remote-b:/same/path": first,
  });
  store.getState().moveProject("remote-a:/same/path", "projects");
  store.getState().moveProject("/same/path", "conversations");
  assert.equal(store.getState().projectSectionByWorkspaceKey["remote-a:/same/path"], undefined);
  assert.equal(store.getState().projectSectionByWorkspaceKey["/same/path"], first);
  assert.equal(store.getState().createSection("  "), null);
});

test("旧固定分区偏好迁移，旧任务分组展示偏好回到项目视图", () => {
  const storage = createStorage({
    "zcode-sidebar-purpose-section-preferences": JSON.stringify({
      projectsExpanded: false,
      conversationsExpanded: true,
      sectionOrder: ["conversations", "projects"],
    }),
    "zcode-sidebar-task-preferences": JSON.stringify({ organizeBy: "grouped", sortBy: "created" }),
  });
  const store = createSidebarSectionsStore(storage);
  assert.deepEqual(store.getState().sectionOrder, ["conversations", "projects"]);
  assert.equal(store.getState().expandedBySectionId.projects, false);
  assert.deepEqual(readSidebarTaskPreferences(storage), {
    organizeBy: "project",
    sortBy: "created",
  });
});
