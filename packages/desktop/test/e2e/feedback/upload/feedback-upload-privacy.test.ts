import { resolve } from "node:path";
import { build } from "esbuild";
import { TID_FEEDBACK_LOGS_OPT_IN } from "@zcode/shared/test-ids";
import { startHelpConfigFixture } from "#e2e/helpers/help-client-config-fixture";

// 浏览器 fixture 单独由 esbuild 打包，不向 WDIO 的 Window 类型注入产品 store 声明。
declare global {
  interface Window {
    feedbackSubmitFixture?: {
      failNextCreate(): void;
      restore(jobId: string): void;
      snapshot(): {
        calls: { create: number; prepare: number; upload: string[]; cleanup: number };
        createInputs: Array<Record<string, unknown>>;
        jobs: Array<{ id: string; status: string; includeLogs?: boolean }>;
      };
    };
  }
}

describe("FB-PRIV-02: 反馈表单到日志服务边界", () => {
  let server: Awaited<ReturnType<typeof startHelpConfigFixture>>;
  let mainHandle: string;
  let windowId: number;

  before(async () => {
    // 按当前 spec 定位仓库根目录，否则测试页面会从仓库外查找入口与 tsconfig。
    const root = resolve(import.meta.dirname, "../../../../../..");
    const bundle = await build({
      entryPoints: [resolve(root, "packages/desktop/test/e2e/helpers/feedback-submit-fixture.js")],
      bundle: true,
      write: false,
      platform: "browser",
      format: "iife",
      alias: { "@": resolve(root, "packages/ui/src") },
      define: { "import.meta.env": "{}", "process.env.NODE_ENV": '"test"' },
      tsconfig: resolve(root, "packages/ui/tsconfig.json"),
    });
    // fixture 页的脚本在 head 同步执行；等 DOM 就绪后再挂载真实表单。
    server = await startHelpConfigFixture(
      {},
      `
      window.addEventListener("error", (event) => {
        document.documentElement.dataset.fixtureError = event.message;
      });
      window.addEventListener("DOMContentLoaded", () => { ${bundle.outputFiles[0]!.text} });
    `,
    );
    mainHandle = await browser.getWindowHandle();
    const existing = await browser.getWindowHandles();
    windowId = await browser.electron.execute(async (electron, url) => {
      const win = new electron.BrowserWindow({
        width: 1000,
        height: 900,
        show: false,
        // 隐藏窗口也保持回调计时稳定，避免 Chromium 后台节流影响表单完成回调。
        webPreferences: { sandbox: true, nodeIntegration: false, backgroundThrottling: false },
      });
      await win.loadURL(url);
      return win.id;
    }, server.origin);
    await browser.waitUntil(
      async () => (await browser.getWindowHandles()).length > existing.length,
    );
    const handle = (await browser.getWindowHandles()).find((item) => !existing.includes(item))!;
    await browser.switchToWindow(handle);
  });
  after(async () => {
    if (windowId)
      await browser.electron.execute(
        (electron, id) => electron.BrowserWindow.fromId(id)?.destroy(),
        windowId,
      );
    if (mainHandle) await browser.switchToWindow(mainHandle);
    await server?.close();
  });

  const snapshot = () => browser.execute(() => window.feedbackSubmitFixture!.snapshot());
  const submit = async () => {
    const previousJobs = (await snapshot()).jobs.length;
    await $("button=Submit feedback").click();
    await browser.waitUntil(
      async () => {
        const jobs = (await snapshot()).jobs;
        return jobs.length > previousJobs && ["success", "error"].includes(jobs.at(-1)!.status);
      },
      { timeout: 10000 },
    );
  };

  for (const kind of ["ssh", "wsl", "docker"] as const) {
    for (const includeLogs of [true, false]) {
      const caseId = includeLogs ? "FB-REMOTE-LOG-01" : "FB-REMOTE-LOG-02";
      it(`${caseId}: ${kind} 连接反馈${includeLogs ? "默认上传日志" : "允许取消日志"}`, async () => {
        await browser.url(`${server.origin}/#remoteKind=${kind}`);
        await browser.refresh();
        const openConnectionFeedback = async () => {
          const feedback = $("button=Feedback");
          await feedback.waitForDisplayed({ timeout: 10000 });
          await feedback.click();
          const logs = $(`[data-testid="${TID_FEEDBACK_LOGS_OPT_IN}"]`);
          await expect(logs).toHaveAttribute("aria-checked", "true");
          return logs;
        };
        const logs = await openConnectionFeedback();
        await expect($("textarea")).toHaveValue(
          expect.stringContaining("E2E_REMOTE_CONNECTION_LOG"),
        );
        if (!includeLogs) {
          await logs.click();
          await expect(logs).toHaveAttribute("aria-checked", "false");
        }
        await submit();
        const result = await snapshot();
        expect(result.jobs.at(-1)).toMatchObject({ status: "success", includeLogs });
        expect(result.createInputs).toHaveLength(1);
        expect(result.createInputs[0]).toMatchObject({
          title: "An error occurred during remote connection. Please help investigate.",
          description: expect.stringContaining("E2E_REMOTE_CONNECTION_LOG"),
          type: "bug",
        });
        expect(result.createInputs[0]!.description).toContain("E2E_REMOTE_FEEDBACK_FAILED");
        expect(result.calls).toEqual({
          create: 1,
          prepare: includeLogs ? 1 : 0,
          upload: includeLogs ? ["log"] : [],
          cleanup: includeLogs ? 1 : 0,
        });
        if (!includeLogs) await openConnectionFeedback();
      });
    }
  }

  it("FB-DESC-02: 空描述不调用服务，有效描述可提交", async () => {
    await browser.url(server.origin);
    const description = $("textarea");
    await description.waitForDisplayed({ timeout: 10000 });
    const submitButton = $("button=Submit feedback");
    await expect(description).toHaveAttribute("required");
    await expect(submitButton).toBeDisabled();
    await description.setValue("   ");
    await expect(submitButton).toBeDisabled();
    expect((await snapshot()).calls).toEqual({ create: 0, prepare: 0, upload: [], cleanup: 0 });
    await description.setValue("E2E_FEEDBACK_REQUIRED_DESCRIPTION");
    await expect(submitButton).toBeEnabled();
    // WebDriver clearValue 不保证触发 React 的 input；通过实际退格事件验证清空。
    await description.setValue(" ");
    await browser.keys("Backspace");
    await expect(description).toHaveValue("");
    await expect(submitButton).toBeDisabled();
    expect((await snapshot()).calls).toEqual({ create: 0, prepare: 0, upload: [], cleanup: 0 });
    await description.setValue("E2E_FEEDBACK_REQUIRED_DESCRIPTION");
    await submit();
    const result = await snapshot();
    expect(result.createInputs).toHaveLength(1);
    expect(result.createInputs[0]).toMatchObject({
      title: "E2E_FEEDBACK_REQUIRED_DESCRIPTION",
      description: expect.stringContaining("E2E_FEEDBACK_REQUIRED_DESCRIPTION"),
    });
  });

  for (const [name, includeLogs, restore] of [
    ["默认提交", true, false],
    ["取消后提交", false, false],
    ["开启日志的后台任务恢复后重试", true, true],
    ["取消日志的后台任务恢复后重试", false, true],
  ] as const) {
    it(`${name}：验证实际归档/上传调用`, async () => {
      await browser.refresh();
      const logs = $(`[data-testid="${TID_FEEDBACK_LOGS_OPT_IN}"]`);
      await browser.waitUntil(
        async () => {
          const error = await browser.execute(() => document.documentElement.dataset.fixtureError);
          if (error) throw new Error(`Feedback fixture failed: ${error}`);
          return logs.isExisting();
        },
        { timeout: 10000 },
      );
      await expect(logs).toHaveAttribute("aria-checked", "true");
      await $("textarea").setValue("E2E_FEEDBACK_LOG_CHOICE");
      if (!includeLogs) await logs.click();
      if (restore) {
        await browser.execute(() => window.feedbackSubmitFixture!.failNextCreate());
        await submit();
        const failed = await snapshot();
        expect(failed.jobs[0]).toMatchObject({ status: "error", includeLogs });
        expect(failed.calls).toEqual({ create: 1, prepare: 0, upload: [], cleanup: 0 });
        await browser.execute(
          (id) => window.feedbackSubmitFixture!.restore(id),
          failed.jobs[0]!.id,
        );
        await expect($("textarea")).toHaveValue("E2E_FEEDBACK_LOG_CHOICE");
        await expect(logs).toHaveAttribute("aria-checked", String(includeLogs));
      }
      await submit();
      const result = await snapshot();
      expect(result.jobs.at(-1)).toMatchObject({ status: "success", includeLogs });
      expect(result.createInputs).toHaveLength(restore ? 2 : 1);
      for (const input of result.createInputs) {
        expect(input).toMatchObject({
          title: "E2E_FEEDBACK_LOG_CHOICE",
          description: expect.stringContaining("E2E_FEEDBACK_LOG_CHOICE"),
          type: "bug",
        });
      }
      if (restore) expect(result.createInputs[1]).toEqual(result.createInputs[0]);
      expect(result.calls).toEqual({
        create: restore ? 2 : 1,
        prepare: includeLogs ? 1 : 0,
        upload: includeLogs ? ["log"] : [],
        cleanup: includeLogs ? 1 : 0,
      });
    });
  }
});
