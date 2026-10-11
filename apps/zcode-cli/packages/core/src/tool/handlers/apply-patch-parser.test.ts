import assert from "node:assert/strict";
import test from "node:test";
import { applyPatchHunks, parseApplyPatch } from "./apply-patch-parser.js";

test("parses four operations and applies ordered hunks while retaining CRLF", () => {
  const operations = parseApplyPatch(`*** Begin Patch
*** Add File: new.ts
+new
*** Update File: current.ts
@@
-first
+FIRST
@@
-last
+LAST
*** Delete File: obsolete.ts
*** Update File: old.ts
*** Move to: moved.ts
@@
-old
+new
*** End Patch`);
  assert.deepEqual(
    operations.map((operation) => operation.type),
    ["add", "update", "delete", "move"],
  );
  assert.equal(
    applyPatchHunks("first\r\nmiddle\r\nlast\r\n", operations[1]!.hunks),
    "FIRST\r\nmiddle\r\nLAST\r\n",
  );
});

test("strict hunks reject missing and ambiguous matches", () => {
  assert.throws(
    () => parseApplyPatch("*** Begin Patch\n*** Add File: binary\n+\0\n*** End Patch"),
    /NUL/,
  );
  const [operation] = parseApplyPatch(
    "*** Begin Patch\n*** Update File: a\n@@\n-old\n+new\n*** End Patch",
  );
  assert.throws(() => applyPatchHunks("other\n", operation!.hunks), /not found/);
  assert.throws(() => applyPatchHunks("old\nold\n", operation!.hunks), /ambiguous/);
  assert.throws(
    () => parseApplyPatch("*** Begin Patch\n*** Delete File: a\nextra\n*** End Patch"),
    /Invalid/,
  );
});
