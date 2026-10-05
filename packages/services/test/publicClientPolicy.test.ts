import assert from "node:assert/strict";
import test from "node:test";
import { createClientConfigService } from "../src/client-config/clientConfigService.js";
import { createClientScenesService } from "../src/client-scenes/clientScenesService.js";

function fixture(options: { env?: Record<string, string | undefined>; fail?: boolean } = {}) {
  const requests: RequestInit[] = [];
  const service = createClientConfigService({
    env: options.env ?? {},
    resolveRequestContext: () => ({
      endpointOrigin: "https://config.example",
      appVersion: "1.0.0",
      platform: "windows",
    }),
    apiClient: {
      async request(_url, init) {
        requests.push(init ?? {});
        if (options.fail) throw new Error("fixture offline");
        return Response.json({
          code: 0,
          data: {
            configs: {
              dynamicWorkflow: { mode: "onDemand" },
              forceUpdate: { minimalVersion: "2.0.0" },
            },
          },
        });
      },
    },
  });
  return { service, requests };
}

test("public policies share the anonymous config snapshot", async () => {
  const { service, requests } = fixture();
  const [workflow, forceUpdate] = await Promise.all([
    service.getDynamicWorkflowClientConfig(),
    service.getForceUpdateConfig(),
  ]);
  assert.deepEqual(workflow, { mode: "onDemand", enabled: true, source: "remote" });
  assert.deepEqual(forceUpdate, { minimalVersion: "2.0.0" });
  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.credentials, "omit");
  assert.equal(new Headers(requests[0]?.headers).has("Authorization"), false);
  assert.equal(await service.getModelContextBudgetStrategy(), "preflight-v1");
});

test("local workflow override does not wait for network", async () => {
  const { service, requests } = fixture({
    env: { ZCODE_DYNAMIC_WORKFLOW_MODE: "alwaysOn" },
    fail: true,
  });
  assert.deepEqual(await service.getDynamicWorkflowClientConfig(), {
    mode: "alwaysOn",
    enabled: true,
    source: "override",
  });
  assert.equal(requests.length, 0);
});

test("config failure disables workflow without blocking ordinary model policy", async () => {
  const { service } = fixture({ fail: true });
  assert.deepEqual(await service.getDynamicWorkflowClientConfig(), {
    mode: "disabled",
    enabled: false,
    source: "default",
  });
  assert.equal(await service.getModelContextBudgetStrategy(), "preflight-v1");
});

test("anonymous recommendations omit retired Off-Peak actions and retain public suggestions", async () => {
  let request: RequestInit | undefined;
  const service = createClientScenesService({
    apiClient: {
      async request(_url, init) {
        request = init;
        return Response.json({
          code: 0,
          msg: "ok",
          data: [
            {
              namespace: "fixture",
              scene: "draft-suggestion",
              options: {
                prompts: {
                  id: "prompts",
                  type: "prompt",
                  contents: {},
                  items: [
                    {
                      id: "public",
                      type: "prompt",
                      labels: { en: "Summary" },
                      contents: { en: "Summarize" },
                    },
                    {
                      id: "retired",
                      type: "prompt",
                      labels: { en: "Idle task" },
                      contents: { en: "Create" },
                      on_finish: "NAVIGATE:AUTOMATIONS:OFFPEAK",
                    },
                  ],
                },
              },
            },
          ],
        });
      },
    },
  });
  const response = await service.list();
  assert.deepEqual(
    response.data[0]?.options.prompts?.items?.map((item) => item.id),
    ["public"],
  );
  assert.equal(request?.credentials, "omit");
});
