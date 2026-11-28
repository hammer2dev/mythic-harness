import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pinE2ELocale } from "#e2e/helpers/desktop-app";
import { isIsolatedE2EHomeDir, resolveE2EStorageRoot } from "#e2e/helpers/e2e-runtime-paths";
import { clearRendererViewport, setRendererViewport } from "#e2e/helpers/renderer-viewport";
import { prepareV4ConversationE2E } from "#e2e/helpers/v4-conversation";

const fakeAcp = `
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { createInterface } = require('node:readline');
const { setTimeout } = require('node:timers/promises');
const lines = createInterface({ input: process.stdin });
let model = 'small';
const send = value => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...value }) + '\\n');
async function waitForRelease(name) {
  const gate = join(__dirname, name);
  while (existsSync(gate)) await setTimeout(25);
}
if (process.argv.includes('--version')) {
  lines.close();
  waitForRelease('hold-version').then(() => console.log('1.2.3'));
}
lines.on('line', async line => {
  const { id, method, params } = JSON.parse(line);
  let result = {};
  if (method === 'initialize') result = { protocolVersion: 1 };
  if (method === 'session/new') {
    await waitForRelease('hold-models');
    result = { sessionId: 'probe', models: {
      currentModelId: model,
      availableModels: [
        { modelId: 'small', name: 'Small' },
        { modelId: 'large', name: 'Large' },
        ...Array.from({ length: 6 }, (_, index) => ({ modelId: 'fixture-' + index, name: 'Fixture ' + index })),
      ]
    } };
  }
  if (method === 'session/set_model') model = params.modelId;
  if (method === 'session/prompt') {
    send({ method: 'session/update', params: {
      sessionId: 'probe', update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'OK ' + model } }
    } });
    result = { stopReason: 'end_turn' };
  }
  if (id !== undefined) send({ id, result });
});
`;

async function setTheme(theme: "light" | "dark") {
  await browser.execute((next) => {
    const actions = (window as Window & { __testActions?: { setTheme(theme: typeof next): void } })
      .__testActions;
    actions?.setTheme(next);
  }, theme);
  await browser.waitUntil(() =>
    browser.execute(
      (dark) => document.documentElement.classList.contains("dark") === dark,
      theme === "dark",
    ),
  );
}

async function expectResponsiveLayout() {
  const measure = () =>
    browser.execute(() => {
      const page = document.querySelector('[data-testid="agent-applications-page"]');
      const viewport = page?.parentElement;
      const header = page?.querySelector("[data-workspace-page-header]");
      const tableFrame = page?.querySelector("table")?.parentElement;
      const title = header?.querySelector("h1");
      const search = header?.querySelector('input[type="search"]');
      const scan = header?.querySelector("button");
      const attach = header?.querySelector('[data-testid="agent-applications-add"]');
      if (!page || !viewport || !header || !tableFrame || !title || !search || !scan || !attach) {
        return null;
      }

      const { left, right } = header.getBoundingClientRect();
      const titleBox = title.getBoundingClientRect();
      const searchBox = search.getBoundingClientRect();
      const scanBox = scan.getBoundingClientRect();
      const attachBox = attach.getBoundingClientRect();
      const controls = [searchBox, scanBox, attachBox];
      const pageBox = page.getBoundingClientRect();
      const tableBox = tableFrame.getBoundingClientRect();
      const viewportCenter = viewport.getBoundingClientRect().left + viewport.clientWidth / 2;
      const frameStyle = getComputedStyle(tableFrame);
      const outerRadii = [
        frameStyle.borderTopLeftRadius,
        frameStyle.borderTopRightRadius,
        frameStyle.borderBottomRightRadius,
        frameStyle.borderBottomLeftRadius,
      ];
      return {
        oneLine: controls.every((box) => Math.abs(box.top - titleBox.top) <= 1),
        inOrder: searchBox.right <= scanBox.left && scanBox.right <= attachBox.left,
        fits: controls.every((box) => box.left >= left - 1 && box.right <= right + 1),
        width: pageBox.width,
        expectedWideWidth:
          80 * Number.parseFloat(getComputedStyle(document.documentElement).fontSize),
        centered: Math.abs((pageBox.left + pageBox.right) / 2 - viewportCenter) <= 1,
        aligned: Math.abs(tableBox.left - left) <= 1 && Math.abs(tableBox.right - right) <= 1,
        rounded: outerRadii.every(
          (radius) => radius === outerRadii[0] && Number.parseFloat(radius) > 0,
        ),
        tableScrolls:
          tableFrame.scrollWidth > tableFrame.clientWidth && frameStyle.overflowX === "auto",
      };
    });

  try {
    await setRendererViewport(1280, 800);
    expect(await measure()).toMatchObject({ oneLine: true, inOrder: true, fits: true });
    await browser.saveScreenshot(
      join(process.env.ZCODE_E2E_ARTIFACT_DIR!, "agent-toolbar-dark.png"),
    );

    await setRendererViewport(2000, 800);
    const wide = await measure();
    expect(wide).toMatchObject({
      centered: true,
      aligned: true,
      rounded: true,
      tableScrolls: false,
    });
    expect(wide?.width).toBe(wide?.expectedWideWidth);
    await browser.saveScreenshot(
      join(process.env.ZCODE_E2E_ARTIFACT_DIR!, "agent-applications-wide-dark.png"),
    );

    await setRendererViewport(480, 800);
    expect(await measure()).toMatchObject({
      oneLine: false,
      fits: true,
      aligned: true,
      rounded: true,
      tableScrolls: true,
    });
  } finally {
    await clearRendererViewport();
  }
}

describe("桌面环境的 Agent 应用", () => {
  before(async () => {
    await prepareV4ConversationE2E({ skipProvider: true });
    await pinE2ELocale("zh-CN");
    await setTheme("dark");
  });

  it("普通滚动区和工作区使用同样的横竖细滚动条，隐藏时仍可滚动", async () => {
    const sizes = await browser.execute(() => {
      const probe = document.createElement("div");
      probe.style.cssText = "position:fixed;left:-1000px;top:0";
      document.body.append(probe);
      const sample = (kind: "normal" | "workspace" | "hidden") => {
        const box = document.createElement("div");
        box.style.cssText = "width:96px;height:96px;overflow:scroll";
        if (kind === "workspace") box.setAttribute("data-workspace-conversation-frame", "");
        if (kind === "hidden") box.classList.add("scrollbar-hide");
        const content = document.createElement("div");
        content.style.cssText = "width:192px;height:192px";
        box.append(content);
        probe.append(box);
        box.scrollLeft = 20;
        box.scrollTop = 20;
        const vertical = box.offsetWidth - box.clientWidth;
        const horizontal = box.offsetHeight - box.clientHeight;
        const thumbBorder = Number.parseFloat(
          getComputedStyle(box, "::-webkit-scrollbar-thumb").borderLeftWidth,
        );
        return {
          vertical,
          horizontal,
          visible: Math.max(0, vertical - 2 * thumbBorder),
          scrolls: box.scrollLeft === 20 && box.scrollTop === 20,
        };
      };
      try {
        return {
          normal: sample("normal"),
          workspace: sample("workspace"),
          hidden: sample("hidden"),
        };
      } finally {
        probe.remove();
      }
    });
    const { normal, workspace, hidden } = sizes;
    expect(normal).toMatchObject({ vertical: 8, horizontal: 8, scrolls: true });
    // Windows 的显示缩放会将透明边框按设备像素取整。
    expect(Math.abs(normal.visible - 4)).toBeLessThan(1);
    expect(workspace).toEqual(normal);
    expect(hidden).toEqual({ vertical: 0, horizontal: 0, visible: 0, scrolls: true });
  });

  it("等待目录和模型时显示加载反馈，并能测试所选模型和恢复配置", async () => {
    const home = process.env.ZCODE_E2E_HOME_DIR;
    if (!isIsolatedE2EHomeDir(home)) throw new Error("缺少隔离测试目录");
    const directory = join(home, "agent-applications-test");
    const script = join(directory, "fake-acp.cjs");
    await mkdir(directory, { recursive: true });
    await writeFile(script, fakeAcp, "utf8");

    const environment = $('[data-testid="workspace-primary-environment"]');
    await environment.click();
    const page = $('[data-testid="agent-applications-page"]');
    await expect(page.$("h1")).toHaveText("Agent应用");
    const add = $('[data-testid="agent-applications-add"]');
    await add.waitForClickable();
    await expectResponsiveLayout();
    const search = page.$('input[type="search"]');
    const codex = page.$('[data-application-id="codex"]');
    await search.setValue("OpenCode");
    await expect(page.$('[data-application-id="opencode"]')).toBeDisplayed();
    await codex.waitForExist({ reverse: true });
    await search.click();
    await browser.keys([process.platform === "darwin" ? "Meta" : "Control", "a"]);
    await browser.keys("Backspace");
    await expect(codex).toBeDisplayed();

    await page.$("button=扫描本机").click();
    await expect(page.$('[role="status"]')).toHaveText(expect.stringContaining("扫描完成"));
    await add.click();

    const dialog = () => $('[role="dialog"]');
    await dialog().$('[name="agent-name"]').setValue("Fixture ACP");
    await dialog().$('[name="agent-path"]').setValue(process.execPath);
    await dialog().$('[name="agent-args"]').setValue(script);
    await dialog().$('[data-testid="agent-application-save"]').click();

    const fixture = () => $('[data-testid="agent-application-custom-row"]');
    await fixture().waitForDisplayed();
    await fixture().$('button[role="switch"]').click();
    await fixture().$('[data-action="models"]').click();
    const readModels = dialog().$('[data-testid="agent-models-read"]');
    const large = dialog().$('[data-model-id="large"]');
    await readModels.click();
    await large.waitForClickable();
    const modelGate = join(directory, "hold-models");
    await writeFile(modelGate, "");
    try {
      await readModels.click();
      await expect(readModels).toHaveText("读取中…");
      await expect(readModels).toHaveAttribute("aria-busy", "true");
      await expect(large).toBeDisplayed();
      const listScrollbarWidth = await browser.execute(() => {
        const list = document
          .querySelector<HTMLElement>('[role="dialog"] [data-model-id]')
          ?.closest("ul");
        return list ? list.offsetWidth - list.clientWidth : null;
      });
      expect(listScrollbarWidth).toBe(8);
      const motion = await browser.execute(() => {
        const icon = document.querySelector('[data-testid="agent-models-read"] svg');
        return {
          animation: icon && getComputedStyle(icon).animationName,
          reduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
        };
      });
      expect(motion.animation).toBe(motion.reduced ? "none" : "spin");
      await browser.saveScreenshot(
        join(process.env.ZCODE_E2E_ARTIFACT_DIR!, "agent-read-models-dark.png"),
      );
    } finally {
      await rm(modelGate, { force: true });
    }
    await expect(readModels).toHaveText("读取模型");
    await large.waitForClickable();
    await large.click();
    await expect(large).toHaveText("停用");
    const small = dialog().$('[data-model-id="small"]');
    await small.click();
    await expect(small).toHaveText("停用");
    await browser.keys("Escape");
    await fixture().$('[data-action="test"]').click();
    const model = dialog().$('[name="test-model"]');
    await model.selectByAttribute("value", "large");
    await dialog().$('[data-testid="agent-test-start"]').click();
    await expect(dialog().$('[data-testid="agent-test-reply"]')).toHaveText("OK large");
    await browser.keys("Escape");

    const chat = $('[data-testid="workspace-primary-chat"]');
    await chat.click();
    await expect(chat).toHaveAttribute("aria-pressed", "true");
    const versionGate = join(directory, "hold-version");
    await writeFile(versionGate, "");
    const loading = page.$('[data-testid="agent-applications-loading"]');
    try {
      await environment.click();
      await expect(loading.$('[role="status"]')).toHaveText("正在读取本机应用…");
      await expect(page.$("th")).toHaveText("应用");
      await browser.saveScreenshot(
        join(process.env.ZCODE_E2E_ARTIFACT_DIR!, "agent-applications-loading-dark.png"),
      );
      await setTheme("light");
      await browser.saveScreenshot(
        join(process.env.ZCODE_E2E_ARTIFACT_DIR!, "agent-applications-loading-light.png"),
      );
    } finally {
      await rm(versionGate, { force: true });
    }
    await loading.waitForExist({ reverse: true });
    await expect(fixture().$('button[role="switch"]')).toHaveAttribute("aria-checked", "true");
    await fixture().$('[aria-label^="Fixture ACP"]').click();
    await expect(dialog()).toHaveText(expect.stringContaining("OK large"));
    const saved = await readFile(
      join(resolveE2EStorageRoot(home), "v2", "agent-applications.json"),
      "utf8",
    );
    expect(JSON.parse(saved)).toMatchObject({
      schemaVersion: 1,
      applications: [
        {
          name: "Fixture ACP",
          path: process.execPath,
          args: [script],
          enabled: true,
          history: [{ modelId: "large", reply: "OK large" }],
        },
      ],
    });
    await browser.keys("Escape");
    await fixture().$('[data-action="more"]').click();
    await $('[role="menuitem"][data-action="remove"]').click();
    await dialog().$("button=移除接入").click();
    await fixture().waitForExist({ reverse: true });
    expect(await readFile(script, "utf8")).toBe(fakeAcp);
  });
});
