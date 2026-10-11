import assert from "node:assert/strict";
import test from "node:test";
import { ToolExposureState, type SearchableTool } from "./tool-exposure.js";

const entry = (
  name: string,
  cost: number,
  source: "builtin" | "mcp" = "builtin",
): SearchableTool => ({
  name,
  description: `${name} capability`,
  source,
  identity: name,
  cost,
});

test("search activates eligible tools, deduplicates matches, and rejects oversized schemas", () => {
  const state = new ToolExposureState();
  const catalog = [entry("Read", 3), entry("ApplyPatch", 4), entry("mcp__test__huge", 20, "mcp")];
  state.prepare(catalog, "turn-1", 12);
  assert.deepEqual(state.exposedNames(catalog), ["Read"]);
  assert.equal(state.search({ query: "ApplyPatch" }, catalog, 12).matches[0]?.status, "loaded");
  assert.equal(
    state.search({ query: "ApplyPatch" }, catalog, 12).matches[0]?.status,
    "already_loaded",
  );
  assert.equal(
    state.search({ query: "huge", source: "mcp" }, catalog, 12).matches[0]?.status,
    "budget_exceeded",
  );
  assert.deepEqual(state.exposedNames(catalog), ["Read", "ApplyPatch"]);
  assert.equal(state.search({ query: "absent" }, catalog, 12).matches.length, 0);
});

test("current-turn activation and use are stable; older unused tools yield to LRU", () => {
  const state = new ToolExposureState();
  const catalog = [entry("Read", 2), entry("Alpha", 4), entry("Beta", 4), entry("Gamma", 4)];
  state.prepare(catalog, "one", 10);
  state.search({ query: "Alpha" }, catalog, 10);
  state.search({ query: "Beta" }, catalog, 10);
  assert.equal(state.search({ query: "Gamma" }, catalog, 10).matches[0]?.status, "budget_exceeded");
  state.prepare(catalog, "two", 10);
  state.touch("Alpha");
  assert.equal(state.search({ query: "Gamma" }, catalog, 10).matches[0]?.status, "loaded");
  assert.deepEqual(state.exposedNames(catalog), ["Read", "Alpha", "Gamma"]);
});

test("compact snapshots restore names only and revalidate changed catalogs and budget", () => {
  const state = new ToolExposureState();
  const catalog = [entry("Read", 2), entry("Alpha", 4), entry("Beta", 4)];
  state.prepare(catalog, "one", 10);
  state.search({ query: "Alpha" }, catalog, 10);
  state.search({ query: "Beta" }, catalog, 10);
  state.touch("Alpha");
  state.prepare(catalog, "two", 10);
  const snapshot = state.compactedSnapshot();
  const restored = new ToolExposureState();
  restored.restore(snapshot);
  restored.prepare(catalog, "resumed", 10);
  assert.deepEqual(restored.exposedNames(catalog), ["Read", "Alpha"]);
  restored.prepare([catalog[0]!, catalog[2]!], "resumed", 10);
  assert.deepEqual(restored.exposedNames(catalog), ["Read"]);
  restored.restore(snapshot);
  restored.prepare(catalog, "resumed-again", 3);
  assert.deepEqual(restored.exposedNames(catalog), ["Read"]);
});

test("resident overflow keeps resident tools and rejects deferred activation", () => {
  const state = new ToolExposureState();
  const catalog = [entry("Read", 8), entry("Write", 8), entry("Alpha", 1)];
  state.prepare(catalog, "one", 10);
  assert.deepEqual(state.exposedNames(catalog), ["Read", "Write"]);
  assert.equal(state.search({ query: "Alpha" }, catalog, 10).matches[0]?.status, "budget_exceeded");
});
