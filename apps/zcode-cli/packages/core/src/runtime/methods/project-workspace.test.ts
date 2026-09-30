import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { NodeContextSourceAdapter } from "../../../../adapters/src/context/index.js";
import { buildRequestUserContextSection } from "../../context/sections/request-user-context.js";
import { buildPersistedConversationInputIntent } from "./input-intent-persistence.js";
import { inputIntentMetadataFromQueueItem } from "../../../../bootstrap/src/zcode-protocol-v4/commands/input-intent.js";
import { SqliteSessionStore } from "../../../../adapters/src/storage/session-store/sqlite-session-store.js";
import { admitPrompt } from "./prompt-admission.js";
import { applyTurnProjectWorkspace, latestProjectWorkspace } from "./project-workspace.js";

test("多个目录的 AGENTS 分别带目录作用域，工作目录不变", async () => {
  const root = await mkdtemp(join(tmpdir(), "zcode-project-context-"));
  try {
    const first = join(root, "first");
    const second = join(root, "second");
    await Promise.all([mkdir(first), mkdir(second)]);
    await Promise.all([
      writeFile(join(first, "AGENTS.md"), "FIRST_ONLY"),
      writeFile(join(second, "AGENTS.md"), "SECOND_ONLY"),
    ]);
    const snapshot = await new NodeContextSourceAdapter({
      env: { HOME: root, USERPROFILE: root },
    }).resolveContextSources({
      workingDirectory: first,
      projectDirectories: [first, second],
      userInstructions: { workingDirectory: first },
    });
    assert.equal(snapshot.workingDirectory, first);
    const sources = snapshot.userInstructions?.sources ?? [];
    assert.deepEqual(
      sources.map((source) => source.scopeDirectory),
      [first, second],
    );
    const context = buildRequestUserContextSection({
      userInstructions: snapshot.userInstructions,
      projectWorkspace: {
        projectId: "p1",
        name: "Project",
        primaryDirectory: second,
        directories: [first, second],
      },
    });
    assert.match(context?.content ?? "", /FIRST_ONLY/);
    assert.match(context?.content ?? "", /SECOND_ONLY/);
    assert.match(context?.content ?? "", /only within this directory/);
    assert.match(context?.content ?? "", /does not change the current session/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("排队输入的项目快照经持久化和提升后保持不变", () => {
  const projectWorkspace = {
    projectId: "p1",
    name: "Project",
    primaryDirectory: "/a",
    directories: ["/a", "/b"],
  };
  const saved = buildPersistedConversationInputIntent(
    "edit both",
    {
      sourceCommandId: "c1",
      queueItemId: "q1",
      clientId: "client",
      kind: "sendText",
      admissionSeq: 1,
      admittedAt: 1,
      requestedDelivery: "queue",
      admittedDelivery: "queue",
      projectWorkspace,
    },
    "queued",
  );
  const restored = inputIntentMetadataFromQueueItem(saved as never, "edit both");
  assert.deepEqual(restored.projectWorkspace, projectWorkspace);
  assert.deepEqual(
    latestProjectWorkspace([{ info: { metadata: { conversationInputIntent: saved } } }] as never),
    projectWorkspace,
  );
  projectWorkspace.directories.push("/later");
  assert.deepEqual(restored.projectWorkspace?.directories, ["/a", "/b"]);
});

test("运行中修改目录的 guide 消息排入下一轮，执行时保留旧 cwd", async () => {
  const original = {
    projectId: "p1",
    name: "Project",
    primaryDirectory: "/a",
    directories: ["/a", "/b"],
  };
  const updated = { ...original, primaryDirectory: "/c", directories: ["/a", "/c"] };
  let accepted: Record<string, unknown> | undefined;
  let contextRequest: Record<string, unknown> | undefined;
  const runtime = {
    config: {
      workspaceProjectId: "p1",
      projectWorkspace: original,
      userInstructions: { workingDirectory: "/a" },
    },
    activeTurn: { steerable: true },
    workingDirectory: "/a",
    workspaceRoot: "/a",
    contextInitialized: true,
    hasActiveOrQueuedTurnWork: () => true,
    enqueueDeferredInput: async (input: Record<string, unknown>) => {
      accepted = input;
      return { kind: "queued" };
    },
    contextSourcePort: {
      resolveContextSources: async (input: Record<string, unknown>) => {
        contextRequest = input;
        return { workingDirectory: "/a" };
      },
    },
  };
  await admitPrompt.call(runtime as never, "edit", undefined, {
    queueDelivery: "guide",
    intent: {
      sourceCommandId: "c1",
      queueItemId: "q1",
      clientId: "client",
      kind: "sendText",
      admissionSeq: 1,
      admittedAt: 1,
      requestedDelivery: "guide",
      admittedDelivery: "guide",
      projectWorkspace: updated,
    },
  });
  assert.equal(accepted?.delivery, "queue");
  assert.deepEqual(runtime.config.projectWorkspace, original);
  await applyTurnProjectWorkspace(runtime as never, updated, {} as never);
  assert.equal(runtime.workingDirectory, "/a");
  assert.deepEqual(contextRequest?.projectDirectories, ["/a", "/c"]);
});

test("会话项目归属持久化独立于执行路径和旧仓库 projectID", async () => {
  const store = new SqliteSessionStore({ dbPath: ":memory:" });
  try {
    const session = await store.createSession({
      id: "session-test",
      projectID: "repo-hash",
      slug: "test",
      directory: "/a",
      path: "/a",
      title: "Test",
      version: "1",
    } as never);
    await store.updateSession({ id: session.id, workspaceProjectId: "project-stable" });
    await store.updateSession({ id: session.id, title: "Renamed" });
    const restored = await store.getSession(session.id);
    assert.equal(restored?.workspaceProjectId, "project-stable");
    assert.equal(restored?.projectID, "repo-hash");
    assert.equal(restored?.directory, "/a");
  } finally {
    store.close();
  }
});
