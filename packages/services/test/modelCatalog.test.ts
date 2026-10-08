import assert from "node:assert/strict";
import test from "node:test";
import { createModelCatalogReader } from "../src/model-provider/modelCatalog.js";

const connection = {
  api: { type: "anthropic-messages" as const, baseUrl: "https://fixture.invalid/anthropic" },
  access: { type: "api-key" as const, apiKey: "fixture-secret" },
};

test("catalog follows protocol pagination and returns only unique nonempty IDs", async () => {
  const seen: URL[] = [];
  const reader = createModelCatalogReader(async (input, init) => {
    const url = new URL(String(input));
    seen.push(url);
    assert.equal(new Headers(init?.headers).get("x-api-key"), "fixture-secret");
    return Response.json(
      seen.length === 1
        ? { data: [{ id: "a" }, { id: "" }], has_more: true, last_id: "a" }
        : { data: [{ id: "a" }, { id: "b" }], has_more: false },
    );
  });
  try {
    assert.deepEqual(await reader.read(connection), ["a", "b"]);
    assert.equal(seen[0]!.pathname, "/anthropic/v1/models");
    assert.equal(seen[1]!.searchParams.get("after_id"), "a");
    const openAI = createModelCatalogReader(async (input) => {
      assert.equal(new URL(String(input)).pathname, "/v1/models");
      return Response.json({ data: [{ id: "x" }] });
    });
    assert.deepEqual(
      await openAI.read({
        ...connection,
        api: { type: "openai-responses", baseUrl: "https://fixture.invalid/v1" },
      }),
      ["x"],
    );
    openAI.dispose();
  } finally {
    reader.dispose();
  }
});

test("DeepSeek official Anthropic connections use its OpenAI directory without changing config", async () => {
  const deepseek = {
    ...connection,
    api: {
      ...connection.api,
      baseUrl: "https://api.deepseek.com/anthropic/",
      headers: { "x-fixture": "catalog" },
    },
  };
  const original = structuredClone(deepseek);
  const seen: URL[] = [];
  const reader = createModelCatalogReader(async (input, init) => {
    const url = new URL(String(input));
    seen.push(url);
    assert.equal(url.origin, "https://api.deepseek.com");
    assert.equal(url.pathname, "/models");
    assert.equal(url.searchParams.has("limit"), false);
    assert.equal(url.searchParams.has("after_id"), false);
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("Authorization"), "Bearer fixture-secret");
    assert.equal(headers.get("x-api-key"), null);
    assert.equal(headers.get("anthropic-version"), null);
    assert.equal(headers.get("x-fixture"), "catalog");
    return Response.json(
      seen.length === 1
        ? { data: [{ id: "deepseek-flash" }], has_more: true, last_id: "deepseek-flash" }
        : { data: [{ id: "deepseek-v4-pro" }], has_more: false },
    );
  });
  try {
    assert.deepEqual(await reader.read(deepseek), ["deepseek-flash", "deepseek-v4-pro"]);
    assert.equal(seen[1]!.searchParams.get("after"), "deepseek-flash");
    assert.deepEqual(deepseek, original);
  } finally {
    reader.dispose();
  }
});

test("directory failures never return partial results or raw credential-bearing errors", async () => {
  const reader = createModelCatalogReader(
    async () => new Response("fixture-secret", { status: 403 }),
  );
  await assert.rejects(reader.read(connection), {
    message: "Model directory request failed (HTTP 403)",
  });
  reader.dispose();
  const invalid = createModelCatalogReader(async () => Response.json({ error: "fixture-secret" }));
  await assert.rejects(invalid.read(connection), {
    message: "Model directory response format is unsupported",
  });
  invalid.dispose();
});

test("deadline includes response body reading", async () => {
  const reader = createModelCatalogReader(
    async () => new Response(new ReadableStream({ start() {} })),
    10,
  );
  await assert.rejects(reader.read(connection), /timed out/);
  reader.dispose();
});
