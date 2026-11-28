import { TID_SETTINGS_PAGE, TID_SETTINGS_SECTION_NAV, testId } from "@zcode/shared/test-ids";
import { clickTestIdByDom } from "#e2e/helpers/desktop-app";
import { sel } from "#e2e/helpers/selectors";

export async function openModelProviderSettings() {
  const navigation = $('[data-testid="workspace-primary-navigation"]:not([inert] *)');
  const environment = navigation.$(sel("workspace-primary-environment"));
  await environment.waitForDisplayed({ timeout: 15000 });
  if ((await environment.getAttribute("aria-pressed")) !== "true") await environment.click();
  await clickTestIdByDom(testId(TID_SETTINGS_SECTION_NAV, "modelProvider"), {
    timeout: 15000,
    timeoutMsg: "环境菜单没有出现模型设置入口",
  });
  await expect($(sel(TID_SETTINGS_PAGE))).toHaveAttribute("data-active-section", "modelProvider");
}

export async function assertNoRemoteModelProviderSyncAction() {
  const remoteSyncActionVisible = await browser.execute(() =>
    Array.from(document.querySelectorAll<HTMLElement>("button"))
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      })
      .some((element) => /同步到远端|Sync to remote/u.test(element.innerText.trim())),
  );

  expect(remoteSyncActionVisible).toBe(false);
}
