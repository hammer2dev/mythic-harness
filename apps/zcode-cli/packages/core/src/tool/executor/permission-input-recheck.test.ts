import assert from "node:assert/strict";
import test from "node:test";
import { createRootTraceContext, createSessionId } from "@zcode/contracts";
import { PermissionService } from "../../permission/service.js";
import { applyPatchToolEntry } from "../handlers/apply-patch.js";
import { resolvePermissionModifiedInput } from "./permission-input-recheck.js";
import type { ToolExecutorDeps } from "./types.js";

test("broker-modified patch cannot gain access to denied destination paths", async () => {
  const sessionId = createSessionId();
  const input = {
    patch_text: "*** Begin Patch\n*** Add File: private/secret\n+changed\n*** End Patch",
  };
  const result = await resolvePermissionModifiedInput({
    deps: {
      permissionService: new PermissionService(),
      getWorkingDirectory: () => process.cwd(),
      getWorkspaceRoot: () => process.cwd(),
      sessionId,
    } as ToolExecutorDeps,
    entry: applyPatchToolEntry,
    modifiedInput: input,
    alreadyCheckedByHook: false,
    mode: "build",
    projectRules: {
      version: 1,
      allow: [{ toolName: "ApplyPatch" }],
      deny: [{ toolName: "Edit", ruleContent: "private/*" }],
    },
    requestId: "modify-patch",
    permissionWaitMs: 0,
    toolCall: { id: "patch", name: "ApplyPatch", input: {} },
    traceContext: createRootTraceContext({ sessionId }),
  });
  assert.equal(result.allowed, false);
});
