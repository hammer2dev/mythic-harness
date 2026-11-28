import { join } from "node:path";
import {
  TID_SETTINGS_BACK_BUTTON,
  TID_SETTINGS_PAGE,
  TID_SETTINGS_SECTION_NAV,
  TID_TASK_SETTINGS_BUTTON,
  testId,
} from "@zcode/shared/test-ids";
import {
  clickTestIdByDom,
  pinE2ELocale,
  restoreElectronRendererContentSize,
  setCurrentElectronRendererContentSize,
} from "#e2e/helpers/desktop-app";
import { skipOccupationOnboardingIfPresent } from "#e2e/helpers/occupation-onboarding";
import { sel } from "#e2e/helpers/selectors";

const settings = () => $(sel(TID_SETTINGS_PAGE));
const section = (id: string) => $(sel(testId(TID_SETTINGS_SECTION_NAV, id)));

describe("设置项目管理下线", () => {
  before(async () => {
    await skipOccupationOnboardingIfPresent();
  });

  it("PJR01：旧入口回到常规，设置搜索移除项目管理，归档管理可用", async function () {
    this.timeout(90_000);
    const originalSize = await setCurrentElectronRendererContentSize(1200, 820);
    try {
      for (const { locale, theme, width, projectLabel, archiveLabel } of [
        {
          locale: "zh-CN",
          theme: "zai-dark",
          width: 1200,
          projectLabel: "项目管理",
          archiveLabel: "归档管理",
        },
        {
          locale: "en-US",
          theme: "zai-light",
          width: 840,
          projectLabel: "Project Management",
          archiveLabel: "Archive management",
        },
      ] as const) {
        await setCurrentElectronRendererContentSize(width, 820);
        await pinE2ELocale(locale);
        await browser.execute((value) => {
          const actions = (window as Window & { __testActions?: { setTheme(theme: string): void } })
            .__testActions;
          if (!actions) throw new Error("缺少主题测试入口");
          actions.setTheme(value);
          localStorage.setItem("zcode-settings-last-section", "projects");
          sessionStorage.setItem("zcode-settings-section-intent", "projects");
        }, theme);

        await clickTestIdByDom(TID_TASK_SETTINGS_BUTTON);
        await settings().waitForDisplayed();
        await expect(section("general")).toHaveAttribute("aria-current", "page");
        expect(await section("projects").isExisting()).toBe(false);
        expect(await $('[data-testid="project-management"]').isExisting()).toBe(false);

        await clickTestIdByDom("settings-search-open");
        const search = $('[data-testid="settings-search-input"]');
        await search.waitForDisplayed();
        await search.setValue(projectLabel);
        expect(await $('[data-settings-search-result="projects"]').isExisting()).toBe(false);
        await search.setValue(archiveLabel);
        const archiveResult = $('[data-settings-search-result="archives"]');
        await archiveResult.waitForDisplayed();
        await archiveResult.click();
        await $('[data-testid="settings-search-dialog"]').waitForDisplayed({ reverse: true });

        await expect(section("archives")).toHaveAttribute("aria-current", "page");
        await $('[data-testid="archive-management"]').waitForDisplayed();
        await browser.waitUntil(() =>
          browser.execute(
            (value) => document.documentElement.classList.contains("theme-" + value),
            theme,
          ),
        );
        await browser.saveScreenshot(
          join(process.env.ZCODE_E2E_ARTIFACT_DIR!, `project-settings-${locale}-${theme}.png`),
        );
        await clickTestIdByDom(TID_SETTINGS_BACK_BUTTON);
        await settings().waitForDisplayed({ reverse: true });
      }
    } finally {
      await restoreElectronRendererContentSize(originalSize);
    }
  });

  it("PJR02：项目行的更多和右键菜单提供单项目操作", async () => {
    if (await settings().isDisplayed()) {
      await clickTestIdByDom(TID_SETTINGS_BACK_BUTTON);
      await settings().waitForDisplayed({ reverse: true });
    }
    const project = $('[data-testid="virtual-project-row"]');
    await project.waitForDisplayed();
    await project.moveTo();
    await project.$('[data-testid="virtual-project-menu"]').click();
    const dropdown = $('[data-slot="dropdown-menu-content"]');
    await dropdown.waitForDisplayed();
    expect(await dropdown.$('[data-testid="virtual-project-delete"]').isDisplayed()).toBe(true);
    expect(await dropdown.$('[data-testid="virtual-project-manage-projects"]').isExisting()).toBe(
      false,
    );
    await dropdown.$('[data-testid="virtual-project-edit"]').click();
    const name = $('[data-testid="virtual-project-name"]');
    await name.waitForDisplayed();
    await $('[role="dialog"]:has([data-testid="virtual-project-name"])')
      .$('.//button[normalize-space(.)="Cancel" or normalize-space(.)="取消"]')
      .click();
    await name.waitForDisplayed({ reverse: true });

    await project.click({ button: "right" });
    const contextMenu = $('[data-slot="context-menu-content"]');
    await contextMenu.waitForDisplayed();
    expect(
      await contextMenu.$('[data-testid="virtual-project-manage-projects"]').isExisting(),
    ).toBe(false);
    await contextMenu.$('[data-testid="virtual-project-edit"]').click();
    await name.waitForDisplayed();
  });
});
