import { createServer } from "node:http";
import { NodePersonalProviderConfigRepository } from "@zcode/provider-node";
import {
  TID_MODEL_PROVIDER_ADD_PROVIDER_BUTTON,
  TID_MODEL_PROVIDER_ADD_MODEL_BUTTON,
  TID_MODEL_PROVIDER_TEMPLATE_ITEM,
  TID_MODEL_PROVIDER_NAV_ITEM,
  TID_MODEL_PROVIDER_API_KEY_INPUT,
  TID_MODEL_PROVIDER_BASE_URL_INPUT,
  TID_MODEL_PROVIDER_API_FORMAT_TRIGGER,
  TID_MODEL_PROVIDER_MODEL_INPUT,
  testId,
} from "@zcode/shared/test-ids";
import {
  clearAppData,
  clickTestIdByDom,
  clickTestIdByWebDriver,
  getE2EAppDataPaths,
} from "#e2e/helpers/desktop-app";
import { restartIntoWorkspace, seedReplayProvider } from "#e2e/helpers/model-provider-restart";
import { openModelProviderSettings } from "#e2e/helpers/settings-model-provider-boundary";
import { sel } from "#e2e/helpers/selectors";
import { prepareV4ConversationE2E } from "#e2e/helpers/v4-conversation";

describe("Todo149 OpenCode Go 模板创建", () => {
  after(async () => {
    await browser.electron.restoreAllMocks();
    await clearAppData();
  });
  it("G149-01：新供应商从空列表开始，只保存用户勾选的模型", async function () {
    this.timeout(150_000);
    const selectedModelId = "gpt-5.6-luna";
    const unselectedModelId = "deepseek-v4.1-flash";
    const fixtureKey = "E2E_GO_FAKE_KEY";
    const catalog = createServer((request, response) => {
      if (
        request.url !== "/v1/models" ||
        request.headers.authorization !== `Bearer ${fixtureKey}`
      ) {
        response.writeHead(404).end();
        return;
      }
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify({ data: [{ id: selectedModelId }, { id: unselectedModelId }] }));
    });
    await new Promise<void>((resolve) => catalog.listen(0, "127.0.0.1", resolve));
    const repository = new NodePersonalProviderConfigRepository({
      filePath: getE2EAppDataPaths().configFile,
      pollingIntervalMs: false,
    });
    try {
      await prepareV4ConversationE2E({ skipProvider: true });
      await restartIntoWorkspace({
        afterElectronProcessExit: () =>
          seedReplayProvider({
            id: "e2e-go-seed",
            name: "E2E Go seed",
            apiKey: "E2E_GO_FAKE",
            baseURL: "https://e2e.invalid/v1",
            models: [],
          }),
      });
      await openModelProviderSettings();
      const templateId = "opencode-go-responses";
      const address = catalog.address();
      if (!address || typeof address === "string")
        throw new Error("Missing fixture catalog address");
      const rowIds = () =>
        $$(`[data-testid^="${TID_MODEL_PROVIDER_MODEL_INPUT}"]`).map((row) =>
          row.getAttribute("title"),
        );
      const before = new Set((await repository.read()).providers.keys());
      await clickTestIdByDom(TID_MODEL_PROVIDER_ADD_PROVIDER_BUTTON);
      const card = $(sel(testId(TID_MODEL_PROVIDER_TEMPLATE_ITEM, templateId)));
      await card.waitForExist({ timeout: 15000 });
      await card.scrollIntoView({ block: "center" });
      await card.click();
      await expect($(sel(TID_MODEL_PROVIDER_BASE_URL_INPUT))).toHaveValue(
        "https://opencode.ai/zen/go/v1",
      );
      expect(await rowIds()).toEqual([]);
      await $(sel(TID_MODEL_PROVIDER_BASE_URL_INPUT)).setValue(
        `http://127.0.0.1:${address.port}/v1`,
      );
      await $(sel(TID_MODEL_PROVIDER_API_KEY_INPUT)).setValue(fixtureKey);
      await clickTestIdByWebDriver("model-catalog-fetch");
      await $(sel("model-catalog-status")).waitForDisplayed({ timeout: 20_000 });
      expect(await rowIds()).toEqual([]);
      await clickTestIdByWebDriver(TID_MODEL_PROVIDER_ADD_MODEL_BUTTON);
      const addModel = $(sel("model-catalog-add-dialog"));
      await addModel.waitForDisplayed();
      const choices = await addModel.$$("label");
      expect(await choices.map((choice) => choice.getText())).toEqual([
        selectedModelId,
        unselectedModelId,
      ]);
      const checkbox = choices[0]!.$('button[role="checkbox"]');
      await expect(checkbox).toHaveAttribute("aria-checked", "false");
      await checkbox.click();
      await addModel.$('button[type="submit"]').click();
      await addModel.waitForExist({ reverse: true });
      expect(await rowIds()).toEqual([selectedModelId]);
      expect((await repository.read()).providers.keys().every((id) => before.has(id))).toBe(true);
      await clickTestIdByDom("model-provider-dialog-done");
      await $(sel("model-provider-dialog")).waitForExist({ reverse: true });

      const stored = await repository.read();
      const providerId = stored.providers.keys().find((id) => !before.has(id));
      expect(providerId).toBeTruthy();
      const saved = stored.providers.getRule(providerId!);
      expect(saved?.templateId).toBe(templateId);
      expect(saved?.config.personalModelIds).toEqual([selectedModelId]);
      expect(stored.models.getExact(providerId!, selectedModelId)?.enabled).toBe(true);
      const access = saved?.config.access;
      expect(access?.type === "api-key" ? access.apiKey : undefined).toBe(fixtureKey);

      await restartIntoWorkspace();
      await openModelProviderSettings();
      await clickTestIdByDom(testId(TID_MODEL_PROVIDER_NAV_ITEM, `custom:${providerId}`));
      await expect($(sel(TID_MODEL_PROVIDER_API_FORMAT_TRIGGER))).toHaveText(
        expect.stringMatching(/Responses/i),
      );
      expect(await rowIds()).toEqual([selectedModelId]);
    } finally {
      repository.dispose();
      await new Promise<void>((resolve, reject) =>
        catalog.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
