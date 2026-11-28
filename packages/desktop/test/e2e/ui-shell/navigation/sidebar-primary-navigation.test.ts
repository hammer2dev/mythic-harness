import { join } from "node:path";
import { TID_WORKFLOWS_REFRESH } from "@zcode/shared";
import {
  TID_AUTOMATION_CREATE_MENU,
  TID_AUTOMATIONS_OPEN,
  TID_TASK_NEW_BUTTON,
} from "@zcode/shared/test-ids";
import { pinE2ELocale } from "#e2e/helpers/desktop-app";
import { openModelProviderSettings } from "#e2e/helpers/settings-model-provider-boundary";
import { prepareV4ConversationE2E } from "#e2e/helpers/v4-conversation";

describe("桌面侧栏主导航", () => {
  before(async () => {
    await prepareV4ConversationE2E({ skipProvider: true });
  });

  it("SNAV02 keeps one set of window controls while switching workspace menus", async () => {
    const navigation = $('[data-testid="workspace-primary-navigation"]');
    await navigation.waitForDisplayed();

    for (const testId of [
      TID_AUTOMATIONS_OPEN,
      "workspace-primary-workflows",
      "plugin-store-sidebar-open",
      "workspace-primary-chat",
    ]) {
      const entry = navigation.$(`[data-testid="${testId}"]`);
      await entry.click();
      await browser.waitUntil(async () => (await entry.getAttribute("aria-pressed")) === "true");

      const visibleControls = await browser.execute(() =>
        Array.from(document.querySelectorAll('[data-testid="desktop-window-controls"]'))
          .filter((group) => group.getClientRects().length > 0)
          .map((group) =>
            Array.from(group.querySelectorAll("button"), (button) =>
              button.getAttribute("data-testid"),
            ),
          ),
      );
      expect(visibleControls).toEqual(
        process.platform === "win32" || process.platform === "linux"
          ? [["window-control-minimize", "window-control-maximize", "window-control-close"]]
          : [],
      );
    }
  });

  it("SNAV01：桌面保留自动化和插件市场入口及导航", async () => {
    for (const theme of ["zai-light", "zai-dark"]) {
      for (const locale of ["zh-CN", "en-US"]) {
        await browser.execute(
          (theme, locale) => {
            const actions = (
              window as typeof window & {
                __testActions?: {
                  setTheme(value: string): void;
                  setLocale(value: string): void;
                };
              }
            ).__testActions;
            if (!actions) throw new Error("缺少界面测试入口");
            actions.setTheme(theme);
            actions.setLocale(locale);
          },
          theme,
          locale,
        );
        const navigation = $('[data-testid="sidebar-primary-navigation"]');
        await navigation.waitForDisplayed();
        const automation = navigation.$(`[data-testid="${TID_AUTOMATIONS_OPEN}"]`);
        const plugins = navigation.$('[data-testid="plugin-store-sidebar-open"]');
        await automation.waitForDisplayed();
        await plugins.waitForDisplayed();
        expect(await navigation.$(`[data-testid="${TID_TASK_NEW_BUTTON}"]`).isDisplayed()).toBe(
          true,
        );
        await automation.click();
        await browser.waitUntil(
          async () => (await automation.getAttribute("aria-pressed")) === "true",
        );
        await plugins.click();
        await browser.waitUntil(
          async () => (await plugins.getAttribute("aria-pressed")) === "true",
        );
        expect(await automation.getAttribute("aria-pressed")).toBe("false");
        await browser.saveScreenshot(
          join(process.env.ZCODE_E2E_ARTIFACT_DIR!, `sidebar-navigation-${theme}-${locale}.png`),
        );
      }
    }
  });

  it("SNAV03 shows concise page headings and icons in the secondary navigation", async () => {
    await pinE2ELocale("zh-CN");
    const navigation = $('[data-testid="workspace-primary-navigation"]');
    for (const page of [
      {
        entry: TID_AUTOMATIONS_OPEN,
        title: "定时任务",
        icon: "clock",
        action: TID_AUTOMATION_CREATE_MENU,
      },
      {
        entry: "workspace-primary-workflows",
        title: "工作流",
        icon: "workflow",
        action: TID_WORKFLOWS_REFRESH,
      },
    ]) {
      const entry = navigation.$(`[data-testid="${page.entry}"]`);
      await entry.click();
      await expect(entry).toHaveAttribute("aria-pressed", "true");
      const overview = $(`nav[aria-label="${page.title}"]`).$("button");
      await expect(overview).toHaveText(page.title);
      const icon = overview.$(`svg.lucide-${page.icon}`);
      await expect(icon).toBeDisplayed();
      await expect(icon).toHaveAttribute("aria-hidden", "true");
      const content = $("[data-automations-content]");
      await expect(content.$("h1")).toHaveText(page.title);
      expect(await content.$("h1 + p").isExisting()).toBe(false);
      await expect(content.$(`[data-testid="${page.action}"]`)).toBeDisplayed();
      await browser.saveScreenshot(
        join(process.env.ZCODE_E2E_ARTIFACT_DIR!, `${page.entry}-title.png`),
      );
    }
  });

  it("SNAV04 aligns the workspace module headings and secondary sidebar", async () => {
    await pinE2ELocale("zh-CN");
    const entryTitles = [
      [TID_AUTOMATIONS_OPEN, "定时任务"],
      ["workspace-primary-workflows", "工作流"],
      ["plugin-store-sidebar-open", "发现资源"],
      ["workspace-primary-environment", "模型设置"],
    ] as const;
    const navigation = $('[data-testid="workspace-primary-navigation"]:not([inert] *)');
    const headingSelector = "[data-workspace-page-header] h1:not([inert] *)";
    await navigation.$('[data-testid="workspace-primary-chat"]').click();
    const projectTitle = $(
      '[data-testid="sidebar-primary-navigation"] [data-testid="workspace-secondary-navigation-title"]',
    );
    await expect(projectTitle).toHaveText("项目");
    const project = await browser.execute(() => {
      const title = document.querySelector<HTMLElement>(
        '[data-testid="sidebar-primary-navigation"] [data-testid="workspace-secondary-navigation-title"]',
      )!;
      const panel = title.closest<HTMLElement>("[data-workspace-sidebar-panel]")!;
      const style = getComputedStyle(title);
      return {
        top: title.getBoundingClientRect().top + Number.parseFloat(style.paddingTop),
        width: panel.getBoundingClientRect().width,
      };
    });
    const headings = [];
    for (const [entry, text] of entryTitles) {
      if (entry === "workspace-primary-environment") await openModelProviderSettings();
      else await navigation.$(`[data-testid="${entry}"]`).click();
      await expect($(headingSelector)).toHaveText(text);
      const { pageHeading, sidebarHeading, centerOffset } = await browser.execute((selector) => {
        const title = document.querySelector<HTMLElement>(selector)!;
        const content = title.closest<HTMLElement>("[data-workspace-page-content]")!;
        const viewport = content.parentElement!;
        const titleRect = title.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();
        const headingRect = title.closest("[data-workspace-page-header]")!.getBoundingClientRect();
        const viewportCenter =
          viewport.getBoundingClientRect().left + viewport.clientLeft + viewport.clientWidth / 2;
        const style = getComputedStyle(title);
        const sidebarTitle = Array.from(
          document.querySelectorAll<HTMLElement>(
            '[data-testid="workspace-secondary-navigation-title"]:not([inert] *)',
          ),
        ).find((element) => element.offsetWidth > 1 && element.offsetHeight > 1);
        const sidebarStyle = sidebarTitle ? getComputedStyle(sidebarTitle) : undefined;
        return {
          pageHeading: {
            topInset: Math.round(titleRect.top - contentRect.top),
            leftInset: Math.round(titleRect.left - headingRect.left),
            top: Math.round(titleRect.top),
            fontSize: style.fontSize,
            lineHeight: style.lineHeight,
            fontWeight: style.fontWeight,
          },
          centerOffset: headingRect.left + headingRect.width / 2 - viewportCenter,
          sidebarHeading:
            sidebarTitle && sidebarStyle
              ? {
                  topDelta:
                    sidebarTitle.getBoundingClientRect().top +
                    Number.parseFloat(sidebarStyle.paddingTop) -
                    titleRect.top,
                  fontSize: sidebarStyle.fontSize,
                  lineHeight: sidebarStyle.lineHeight,
                  fontWeight: sidebarStyle.fontWeight,
                  width: (sidebarTitle.closest("[data-workspace-sidebar-panel]") ??
                    sidebarTitle.closest("aside"))!.getBoundingClientRect().width,
                }
              : null,
        };
      }, headingSelector);
      expect(Math.abs(centerOffset)).toBeLessThanOrEqual(1);
      const { top, ...layout } = pageHeading;
      headings.push(layout);
      expect(sidebarHeading).not.toBeNull();
      if (sidebarHeading) {
        expect(sidebarHeading).toMatchObject({
          fontSize: pageHeading.fontSize,
          lineHeight: pageHeading.lineHeight,
          fontWeight: pageHeading.fontWeight,
        });
        expect(Math.abs(sidebarHeading.topDelta)).toBeLessThanOrEqual(1);
        expect(sidebarHeading.width).toBeCloseTo(project.width, 0);
        expect(Math.abs(top - project.top)).toBeLessThanOrEqual(1);
      }
    }
    const [scheduledTasks, workflows, discovery, modelSettings] = headings;
    const { width, uiFontSize } = await browser.execute(() => ({
      width: innerWidth,
      uiFontSize: Number.parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--ui-font-size"),
      ),
    }));
    expect(scheduledTasks).toMatchObject({
      topInset: width >= 768 ? 10 : 6,
      leftInset: 0,
      fontSize: `${uiFontSize + 6}px`,
    });
    expect(workflows).toEqual(scheduledTasks);
    expect(discovery).toEqual(scheduledTasks);
    expect(modelSettings).toEqual(scheduledTasks);
    await $(
      '[data-testid="workspace-primary-navigation"]:not([inert] *) [data-testid="workspace-primary-chat"]',
    ).click();
  });
});
