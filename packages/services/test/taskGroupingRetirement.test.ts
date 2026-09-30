import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { ZCODE_AGENT_PROVIDER } from "@zcode/shared";
import { TaskIndexRepo } from "../src/session/taskIndexRepo.js";
import { createZCodeTaskServiceAdapter } from "../src/zcode-agent/zcodeTaskServiceAdapter.js";
import { runTasksDatabaseMigrations } from "../src/session/tasksDatabase/migrations.js";
import {
  AUTOMATION_SCHEMA,
  OFF_PEAK_SCHEMA,
  TASK_INDEX_SCHEMA,
} from "../src/session/tasksDatabase/schema-v1.js";

const previousMigrations = [
  ["0001_adopt_task_schema", "3e8337b015d94b05dd31a6003f3acc649e821794cfa288bc0af3022698bd4d17"],
  ["0002_provider_selection", "7244ef7c351f8d02750ab1953fff09f493a71befbf1b6e2d4bab726b0c6b48fc"],
  [
    "0003_official_glm_selection",
    "8987adb50ae412a46c294141c1af89ccfc252f22d41351bdf4c7528f56edc8b4",
  ],
] as const;

test("退役历史任务分组时保留任务事实、自动化记录与调度，重复升级不改历史校验值", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zcode-task-group-retirement-"));
  const databasePath = join(directory, "tasks.sqlite");
  const db = new DatabaseSync(databasePath);
  const repo = new TaskIndexRepo(databasePath);
  try {
    db.exec("PRAGMA foreign_keys = ON");
    db.exec(TASK_INDEX_SCHEMA + AUTOMATION_SCHEMA + OFF_PEAK_SCHEMA);
    db.exec(`
      ALTER TABLE tasks ADD COLUMN searchable_text TEXT NOT NULL DEFAULT '';
      ALTER TABLE tasks ADD COLUMN cron_automation_id TEXT;
      ALTER TABLE tasks ADD COLUMN off_peak_task_id TEXT;
      CREATE TABLE tasks_schema_migration (
        id TEXT PRIMARY KEY, checksum TEXT NOT NULL, time_applied INTEGER NOT NULL
      );
    `);
    for (const [id, checksum] of previousMigrations) {
      db.prepare("INSERT INTO tasks_schema_migration VALUES (?, ?, 1)").run(id, checksum);
    }
    db.exec(`
      INSERT INTO tasks (workspace_key, workspace_path, task_id, title, created_at, updated_at,
        pinned, archived, unread_at, title_overridden, cron_automation_id, off_peak_task_id)
      VALUES
        ('fixture-project', 'fixture-project', 'normal-session', '自定义标题', 1, 3, 1, 0, 3, 1, NULL, NULL),
        ('fixture-project', 'fixture-project', 'cron-session', '定时任务', 1, 2, 0, 1, NULL, 0, 'automation', NULL),
        ('fixture-project', 'fixture-project', 'idle-session', '闲时任务', 1, 2, 0, 0, NULL, 0, NULL, 'idle');
      INSERT INTO task_groups VALUES
        ('manual', '手动分组', 'gray', 1, 1),
        ('zcode-default-group-cron', 'cron', 'blue', 1, 1),
        ('zcode-default-group-off-peak', 'off-peak', 'purple', 1, 1);
      INSERT INTO task_group_members VALUES
        ('manual', 'fixture-project', 'fixture-project', NULL, 'normal-session', 1, 1, 1, 1),
        ('zcode-default-group-cron', 'fixture-project', 'fixture-project', NULL, 'cron-session', 1, 1, 1, 1),
        ('zcode-default-group-off-peak', 'fixture-project', 'fixture-project', NULL, 'idle-session', 1, 1, 1, 1);
      INSERT INTO task_group_view_node_orders VALUES ('group', 'manual', 1, 1, 1);
      INSERT INTO task_group_workspace_bootstraps VALUES ('fixture-project', 'manual', 1, 1);
      INSERT INTO automations (automation_id, cron_expr, prompt, workspace_key, workspace_path,
        target_task_id, next_run_at, running, created_at, updated_at)
        VALUES ('automation', '* * * * *', 'fixture', 'fixture-project', 'fixture-project', 'cron-session', 9, 1, 1, 1);
      INSERT INTO automation_runs (run_id, automation_id, workspace_key, session_id, created_at, updated_at)
        VALUES ('run', 'automation', 'fixture-project', 'cron-session', 1, 1);
      INSERT INTO off_peak_tasks (off_peak_task_id, session_id, conversation_id, prompt, permission_mode,
        workspace_key, workspace_path, status, queued_at, created_at, updated_at)
        VALUES ('idle', 'idle-session', 'idle-session', 'fixture', 'build', 'fixture-project', 'fixture-project', 'queued', 1, 1, 1);
    `);
    for (const row of db.prepare("SELECT * FROM tasks").all()) {
      db.prepare("UPDATE tasks SET meta_json = ? WHERE task_id = ?").run(
        JSON.stringify({
          taskId: row.task_id,
          traceId: row.task_id,
          title: row.title,
          workspacePath: row.workspace_path,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          mode: "build",
        }),
        row.task_id,
      );
    }
    const retainedTables = ["tasks", "automations", "automation_runs", "off_peak_tasks"];
    const previousRows = retainedTables.map((table) => db.prepare(`SELECT * FROM ${table}`).all());

    runTasksDatabaseMigrations(db);
    assert.deepEqual(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'task_group%'")
        .all(),
      [],
    );
    assert.deepEqual(
      retainedTables.map((table) => db.prepare(`SELECT * FROM ${table}`).all()),
      previousRows,
    );
    const ledger = db.prepare("SELECT id, checksum FROM tasks_schema_migration ORDER BY id").all();
    assert.equal(ledger.length, 4);
    assert.deepEqual(
      ledger.slice(0, 3).map((row) => ({ ...row })),
      previousMigrations.map(([id, checksum]) => ({ id, checksum })),
    );
    runTasksDatabaseMigrations(db);
    assert.deepEqual(
      db.prepare("SELECT id, checksum FROM tasks_schema_migration ORDER BY id").all(),
      ledger,
    );

    await repo.ensureReady();
    const tasks = await repo.listTaskMetas({ workspacePath: "fixture-project" });
    assert.equal(tasks.length, 3);
    assert.equal(
      tasks.find((task) => task.taskId === "cron-session")?.cronAutomationId,
      "automation",
    );
    assert.equal(tasks.find((task) => task.taskId === "idle-session")?.offPeakTaskId, "idle");
  } finally {
    repo.close();
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("开启自动归档后读取活动任务会归档旧已完成任务，并保留置顶与未读任务", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zcode-task-list-auto-archive-"));
  const repo = new TaskIndexRepo(join(directory, "tasks.sqlite"));
  const changedTasks: Array<{ taskId?: string; reason: string }> = [];
  const noopSubscription = () => ({ dispose() {} });
  const service = createZCodeTaskServiceAdapter({
    taskIndexRepo: repo,
    zcodeAgentService: { disposeAll() {} },
    taskIndexSyncer: {
      onSessionTerminalEvent: noopSubscription,
      onSessionReadyEvent: noopSubscription,
      emitWorkspaceTaskListChanged: (target: { taskId?: string }, _meta: unknown, reason: string) =>
        changedTasks.push({ taskId: target.taskId, reason }),
      disposeAll() {},
    },
    settingService: {
      get: async () => ({ taskAutoArchiveEnabled: true, taskAutoArchiveOlderThanDays: 7 }),
    },
  } as unknown as Parameters<typeof createZCodeTaskServiceAdapter>[0]);
  try {
    const updatedAt = Date.now() - 14 * 24 * 60 * 60 * 1000;
    for (const taskId of ["completed", "pinned", "unread"]) {
      await repo.syncTaskMeta({
        meta: {
          taskId,
          traceId: taskId,
          title: taskId,
          workspacePath: "fixture-project",
          provider: ZCODE_AGENT_PROVIDER,
          createdAt: updatedAt,
          updatedAt,
          mode: "build",
          status: "completed",
          ...(taskId === "unread" ? { unreadAt: updatedAt } : {}),
        },
        pinned: taskId === "pinned",
      });
    }
    const active = await service.listTasks({ workspacePath: "fixture-project" });
    assert.deepEqual(
      active.map((task) => task.taskId),
      ["unread"],
    );
    assert.deepEqual(
      (await service.listPinnedTasks({ workspacePath: "fixture-project" })).map(
        (task) => task.taskId,
      ),
      ["pinned"],
    );
    assert.deepEqual(
      (await service.listArchivedTasks({ workspacePath: "fixture-project" })).map(
        (task) => task.taskId,
      ),
      ["completed"],
    );
    assert.deepEqual(changedTasks, [{ taskId: "completed", reason: "task_meta_changed" }]);
  } finally {
    service.disposeAll();
    await rm(directory, { recursive: true, force: true });
  }
});
