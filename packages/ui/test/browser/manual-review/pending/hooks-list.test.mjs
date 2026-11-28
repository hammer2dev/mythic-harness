import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const uiRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const fixture = `
  import { useState } from "react";
  import { createRoot } from "react-dom/client";
  import { ZCodeIntlProvider } from "@/i18n/IntlProvider.js";
  import { HooksList } from "@/settings/HooksList.js";

  const installed = {
    id: "installed", event: "SessionStart", command: "installed-command",
    type: "command", enabled: true,
  };
  const legacy = {
    id: "legacy", event: "Stop", command: "legacy-command",
    type: "command", enabled: false, editable: false,
  };
  const plugin = {
    pluginId: "design", pluginName: "设计", pluginEnabled: true, pluginScope: "user",
    detail: {
      event: "PreToolUse", type: "command", command: "design-command",
      sourcePath: "design/hooks/hooks.json", runnable: true,
    },
  };
  function rejectWrite() {
    throw new Error("Changing list visibility must not write hook settings");
  }
  function Fixture() {
    const [query, setQuery] = useState("");
    const emptyInstalled = document.getElementById("root").hasAttribute("data-empty-installed");
    return (
      <ZCodeIntlProvider initialLocale="zh-CN">
        <input aria-label="搜索钩子" value={query} onChange={(event) => setQuery(event.target.value)} />
        <HooksList
          editableHooks={query || emptyInstalled ? [] : [installed]}
          compatibilityHooks={legacy.command.includes(query) ? [legacy] : []}
          pluginHooks={plugin.detail.command.includes(query) ? [plugin] : []}
          searchActive={Boolean(query)}
          installedEmptyTitle="尚未安装钩子"
          operatingHookId={null}
          onEdit={rejectWrite}
          onImport={rejectWrite}
          onToggle={rejectWrite}
        />
      </ZCodeIntlProvider>
    );
  }
  createRoot(document.getElementById("root")).render(<Fixture />);
`;

test("installed hooks stay visible while discovered hooks can be expanded and searched", async () => {
  const bundle = await build({
    stdin: { contents: fixture, resolveDir: uiRoot, loader: "tsx" },
    absWorkingDir: uiRoot,
    bundle: true,
    jsx: "automatic",
    loader: { ".png": "dataurl" },
    write: false,
  });
  const browser = await chromium.launch(
    process.env.CHROME_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROME_EXECUTABLE_PATH }
      : { channel: "chrome" },
  );
  const errors = [];
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(10000);
    page.on("pageerror", (error) => errors.push(error.message));
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });

    const discovery = page.locator("summary").filter({ hasText: "发现的钩子" });
    const installed = page.getByTestId("configured-hook-row");
    const plugin = page.getByTestId("plugin-hook-row");
    const legacy = page.getByText("legacy-command", { exact: true });
    const importAction = page.getByRole("button", { name: "导入", exact: true });
    await discovery.waitFor();
    assert.match(await discovery.innerText(), /发现的钩子\s*2/);
    await installed.waitFor();
    assert.equal(await installed.getByRole("switch").getAttribute("aria-checked"), "true");
    assert.equal(await plugin.isVisible(), false);
    assert.equal(await legacy.isVisible(), false);

    await discovery.press("Enter");
    await plugin.waitFor();
    await legacy.waitFor();
    await importAction.waitFor();
    await discovery.click();
    await plugin.waitFor({ state: "hidden" });
    await legacy.waitFor({ state: "hidden" });

    const search = page.getByRole("textbox", { name: "搜索钩子" });
    await search.fill("design-command");
    await plugin.waitFor();
    assert.match(await discovery.innerText(), /发现的钩子\s*1/);
    assert.equal(await legacy.isVisible(), false);
    await search.clear();
    await plugin.waitFor({ state: "hidden" });
    await installed.waitFor();
    assert.equal(await installed.getByRole("switch").getAttribute("aria-checked"), "true");

    await page.setContent('<div id="root" data-empty-installed></div>');
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    await page.getByText("尚未安装钩子", { exact: true }).waitFor();
    assert.match(await page.getByRole("heading", { name: /已安装/ }).innerText(), /已安装\s*0/);
    await discovery.waitFor();
    assert.equal(await plugin.isVisible(), false);
    assert.equal(await legacy.isVisible(), false);
  } finally {
    await browser.close();
    assert.deepEqual(errors, []);
  }
});
