import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { pinE2ELocale } from "#e2e/helpers/desktop-app";
import { resolveE2EStorageRoot } from "#e2e/helpers/e2e-runtime-paths";
import { prepareV4ConversationE2E } from "#e2e/helpers/v4-conversation";

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

async function expectCenteredAccountForm() {
  const border = await browser.waitUntil(
    () =>
      browser.execute(() => {
        const dialog = document.querySelector('[data-slot="dialog-content"]');
        const description = dialog?.querySelector('textarea[name="description"]');
        if (!dialog || !description) return null;

        // 从详情切到编辑会复用弹窗，等待定位过渡结束再取边框样式。
        const { left, top, width, height } = dialog.getBoundingClientRect();
        if (
          Math.abs(left + width / 2 - innerWidth / 2) >= 2 ||
          Math.abs(top + height / 2 - innerHeight / 2) >= 2
        ) {
          return null;
        }

        const { borderTopColor, borderTopWidth, borderTopStyle } = getComputedStyle(description);
        const sample = document.createElement("span");
        sample.hidden = true;
        sample.style.color = description.matches(":hover")
          ? "var(--color-input-border-hover)"
          : "var(--color-input-border)";
        dialog.append(sample);
        const expectedBorderColor = getComputedStyle(sample).color;
        sample.remove();

        return { borderTopColor, borderTopWidth, borderTopStyle, expectedBorderColor };
      }),
    { timeout: 3000, timeoutMsg: "账号表单未在窗口中居中" },
  );
  expect(border.borderTopStyle).toBe("solid");
  expect(Number.parseFloat(border.borderTopWidth)).toBeGreaterThan(0);
  expect(border.borderTopColor).toBe(border.expectedBorderColor);
}

function readFieldRowLayout() {
  return browser.execute(() => {
    const name = document.querySelector('input[aria-label="字段名称 1"]');
    const value = document.querySelector('textarea[aria-label="字段值 1"]');
    const remove = document.querySelector('button[aria-label="移除字段 1"]');
    if (!name || !value || !remove) throw new Error("条目字段行未显示");

    const nameBox = name.getBoundingClientRect();
    const valueBox = value.getBoundingClientRect();
    const removeBox = remove.getBoundingClientRect();
    const nameStyle = getComputedStyle(name);
    const valueStyle = getComputedStyle(value);
    return {
      nameHeight: nameBox.height,
      valueHeight: valueBox.height,
      removeHeight: removeBox.height,
      firstLineAligned:
        Math.abs(nameBox.top - valueBox.top) < 1 &&
        Math.abs(nameBox.top - removeBox.top) < 1 &&
        nameStyle.lineHeight === valueStyle.lineHeight,
      matchingBorder:
        valueStyle.borderTopStyle === "solid" &&
        Number.parseFloat(valueStyle.borderTopWidth) > 0 &&
        nameStyle.borderTopColor === valueStyle.borderTopColor,
    };
  });
}

describe("环境账号管理", () => {
  before(async () => {
    await prepareV4ConversationE2E({ skipProvider: true });
    await pinE2ELocale("zh-CN");
  });

  it("维护加密账号资料，并从环境重新打开已保存的条目", async () => {
    const groupName = "E2E 订单环境";
    const entryName = "E2E 订单库";
    const description = "用于 E2E 的连接说明";
    const updatedDescription = "已更新的连接说明";
    const value = "fixture-account-secret\nsecond line";
    const environment = $('[data-testid="workspace-primary-environment"]:not([inert] *)');
    const accounts = $('[data-testid="environment-account-management"]');
    await environment.click();
    await accounts.click();
    await setTheme("dark");

    const page = $('[data-testid="account-management"]');
    await expect(page.$("h1")).toHaveText("账号管理");
    const groupList = page.$('section[aria-label="账号组"] ul');
    const defaultGroup = groupList.$("button=默认组");
    const table = page.$("table");
    await expect(groupList.$("li:first-child button")).toHaveText("默认组");
    await expect(defaultGroup).toHaveAttribute("aria-current", "true");
    await expect(table.$("thead")).toBeDisplayed();
    await expect(table.$('td[colspan="4"]')).toHaveText("该账号组暂无条目");

    const toolbar = await browser.execute(() => {
      const header = document.querySelector('section[aria-label="默认组"] header');
      const title = header?.querySelector("h2");
      const search = header?.querySelector('input[type="search"]');
      const filter = header?.querySelector('[role="combobox"]');
      const add = header?.querySelector('[data-testid="account-entry-add"]');
      if (!title || !search || !filter || !add) throw new Error("账号条目工具栏未显示");
      const rects = [title, search, filter, add].map((item) => item.getBoundingClientRect());
      return {
        top: rects.map(({ top }) => top),
        height: rects.map(({ height }) => height),
        matchingBorder:
          getComputedStyle(search).borderTopColor === getComputedStyle(filter).borderTopColor,
      };
    });
    expect(Math.max(...toolbar.top) - Math.min(...toolbar.top)).toBeLessThan(1);
    expect(new Set(toolbar.height).size).toBe(1);
    expect(toolbar.matchingBorder).toBe(true);

    await groupList.$('button[aria-label="默认组 的操作"]').click();
    await expect($('[role="menuitem"]')).toHaveText("复制整组资料");
    await expect($('[data-testid="account-group-delete"]')).not.toExist();
    await browser.keys("Escape");

    const addGroup = page.$('[data-testid="account-group-add"]');
    await expect(addGroup).toHaveAttribute("aria-label", "新建账号组");
    expect(await addGroup.getText()).toBe("");
    await addGroup.click();
    const dialog = $('[role="dialog"]');
    await expect(dialog.$("h2")).toHaveText("新建账号组");
    await expectCenteredAccountForm();
    await dialog.$('input[name="name"]').setValue(groupName);
    await dialog.$('button[type="submit"]').click();
    await expect(page.$("h2=" + groupName)).toBeDisplayed();
    await expect(groupList.$("li:first-child button")).toHaveText("默认组");
    await defaultGroup.click();

    await page.$('[data-testid="account-entry-add"]').click();
    await expect(dialog.$("h2")).toHaveText("新增条目");
    await expectCenteredAccountForm();
    await dialog.$("h2").moveTo();
    const emptyField = await readFieldRowLayout();
    expect(emptyField.matchingBorder).toBe(true);
    expect(emptyField.firstLineAligned).toBe(true);
    expect(emptyField.valueHeight).toBeCloseTo(emptyField.nameHeight, 0);
    expect(emptyField.removeHeight).toBeCloseTo(emptyField.nameHeight, 0);
    await dialog.$('input[name="name"]').setValue(entryName);
    await dialog.$('textarea[name="description"]').setValue(description);
    await dialog.$('select[name="type"]').selectByAttribute("value", "database");
    await expect(dialog.$('input[aria-label="字段名称 1"]')).toHaveValue("主机");
    await dialog.$('textarea[aria-label="字段值 1"]').setValue(value);
    const multilineField = await readFieldRowLayout();
    expect(multilineField.valueHeight).toBeGreaterThan(multilineField.nameHeight);
    expect(multilineField.firstLineAligned).toBe(true);
    await dialog.$('input[aria-label="字段名称 2"]').setValue("主机");
    await dialog.$('button[type="submit"]').click();
    await expect(dialog.$('[role="alert"]')).toHaveText("同一条目中的字段名称不能重复。");
    await dialog.$('input[aria-label="字段名称 2"]').setValue("端口");
    await dialog.$('button[type="submit"]').click();
    const savedEntry = table.$("button=" + entryName);
    await expect(savedEntry).toBeDisplayed();
    const headers = await browser.execute(() =>
      Array.from(
        document.querySelectorAll('[data-testid="account-management"] th'),
        (cell) => cell.textContent,
      ),
    );
    expect(headers).toEqual(["名称", "说明", "类型", "操作"]);
    await expect(page.$("tbody tr td:nth-child(2)")).toHaveText(description);
    expect(
      await browser.execute(() => {
        const cell = document.querySelector(
          '[data-testid="account-management"] tbody td:last-child',
        );
        return cell && getComputedStyle(cell).textAlign;
      }),
    ).toBe("center");

    await page.$('button[aria-label="按类型筛选"]').click();
    await $('div[role="option"]=自定义').click();
    await expect(table.$("p=没有匹配的条目")).toBeDisplayed();
    await expect(table.$("thead")).toBeDisplayed();
    await table.$("button=清除筛选").click();
    await expect(savedEntry).toBeDisplayed();

    const disk = await readFile(join(resolveE2EStorageRoot(), "v2", "account-groups.enc"), "utf8");
    expect(disk).toMatch(/^enc:v2:/u);
    expect(disk.includes("fixture-account-secret")).toBe(false);

    await $('[data-testid="workspace-primary-chat"]:not([inert] *)').click();
    await setTheme("light");
    await environment.click();
    await accounts.click();
    await expect(defaultGroup).toHaveAttribute("aria-current", "true");
    await page.$('input[type="search"]').setValue("second line");
    await expect(savedEntry).toBeDisplayed();
    await savedEntry.click();
    expect(await dialog.$("dd").getProperty("textContent")).toBe(value);
    await browser.execute(() => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            document.documentElement.dataset.accountCopy = text;
          },
        },
      });
    });
    await dialog.$('button[aria-label="复制字段 主机"]').click();
    expect(await browser.execute(() => document.documentElement.dataset.accountCopy)).toBe(value);
    await browser.execute(() => {
      Reflect.deleteProperty(navigator, "clipboard");
      delete document.documentElement.dataset.accountCopy;
    });
    await dialog.$("button=编辑条目").click();
    await expect(dialog.$("h2")).toHaveText("编辑条目");
    await expectCenteredAccountForm();
    await dialog.$("h2").moveTo();
    expect((await readFieldRowLayout()).matchingBorder).toBe(true);
    await expect(dialog.$('textarea[name="description"]')).toHaveValue(description);
    await dialog.$('textarea[name="description"]').setValue(updatedDescription);
    await dialog.$('button[type="submit"]').click();
    await expect(dialog.$("p=" + updatedDescription)).toBeDisplayed();
    await browser.keys("Escape");

    await expect(page.$("tbody tr td:nth-child(2)")).toHaveText(updatedDescription);
    await page.$('button[aria-label="删除 ' + entryName + '"]').click();
    await dialog.$("button=确认删除").click();
    await expect(table.$('td[colspan="4"]')).toHaveText("该账号组暂无条目");
    await groupList.$("button=" + groupName).click();
    await page.$('button[aria-label="' + groupName + ' 的操作"]').click();
    await $('[data-testid="account-group-delete"]').click();
    await dialog.$("button=确认删除").click();
    await expect(page.$("button=" + groupName)).not.toExist();
    await expect(defaultGroup).toHaveAttribute("aria-current", "true");
  });
});
