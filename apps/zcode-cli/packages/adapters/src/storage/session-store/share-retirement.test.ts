import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { createProjectId, createSessionId } from "@zcode/contracts";
import { runSqliteSessionMigrationsAsync } from "./migration-runner.js";
import { createSession, getSession, updateSession } from "./repositories/sessions.js";

test("新会话表不含分享列，普通会话仍可创建、读取和更新", async () => {
  const db = new DatabaseSync(":memory:");
  try {
    await runSqliteSessionMigrationsAsync(db, ":memory:");
    assert.equal(
      db
        .prepare("pragma table_info(session)")
        .all()
        .some((row) => row.name === "share_url"),
      false,
    );
    const id = createSessionId("retirement-fixture");
    const created = createSession(db, {
      id,
      projectID: createProjectId("retirement-project"),
      slug: "retirement-fixture",
      directory: "/fixture/project",
      title: "普通会话",
      version: "0.1.0",
    });
    assert.equal(created.title, "普通会话");
    const updated = await updateSession(db, { id, title: "更新标题", titleSource: "custom" });
    assert.equal(updated.title, "更新标题");
    assert.equal(getSession(db, id)?.title, "更新标题");
  } finally {
    db.close();
  }
});
