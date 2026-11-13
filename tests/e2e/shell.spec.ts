import { expect, test, type Page } from "@playwright/test";

import {
  expectNoSeriousViolations,
  openQuickAdd,
  signInAndConfirm,
  signInForTest,
} from "./helpers";
import { THEME_STORAGE_KEY } from "../../src/lib/theme";

const compact = { width: 390, height: 844 };
const desktop = { width: 1280, height: 800 };

function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Main", exact: true });
}

function heading(page: Page, name: string) {
  return page.getByRole("heading", { level: 1, name, exact: true });
}

function moreTrigger(page: Page) {
  return mainNav(page).getByRole("button", { name: "More", exact: true });
}

async function openMore(page: Page) {
  await moreTrigger(page).click();
  const sheet = page.getByRole("dialog", { name: "More", exact: true });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe("compact shell", () => {
  test.use({ viewport: compact, hasTouch: true });

  test("the bar, More and Plan tabs reach every destination", async ({
    page,
  }) => {
    test.slow();
    await signInAndConfirm(page, "Ada");
    const nav = mainNav(page);
    await expect(nav.getByRole("link")).toHaveText([
      "Home",
      "Plan",
      "Goals",
      "Track",
    ]);
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const box = (await nav.boundingBox())!;
    expect(box.width).toBe(390);
    expect(box.y + box.height).toBe(844);
    for (const control of await nav.locator("a, button").all()) {
      const target = (await control.boundingBox())!;
      expect(target.width).toBeGreaterThanOrEqual(48);
      expect(target.height).toBeGreaterThanOrEqual(48);
    }

    for (const label of ["Goals", "Track", "Home", "Plan"]) {
      const link = nav.getByRole("link", { name: label, exact: true });
      await link.click();
      await expect(
        heading(page, label === "Plan" ? "All tasks" : label),
      ).toBeVisible();
      await expect(link).toHaveAttribute("aria-current", "page");
    }
    const tabs = page.getByRole("navigation", { name: "Plan", exact: true });
    const planLabels = ["Today", "Upcoming", "Calendar", "Inbox", "All tasks"];
    await expect(tabs.getByRole("link")).toHaveCount(planLabels.length);
    for (const [index, label] of planLabels.entries()) {
      await expect(tabs.getByRole("link").nth(index)).toHaveAccessibleName(
        label,
      );
      const tab = tabs.getByRole("link", { name: label, exact: true });
      await tab.click();
      await expect(heading(page, label)).toBeVisible();
      await expect(tab).toHaveAttribute("aria-current", "page");
      await expect(
        nav.getByRole("link", { name: "Plan", exact: true }),
      ).toHaveAttribute(
        "aria-current",
        label === "All tasks" ? "page" : "true",
      );
    }

    for (const [label, title] of [
      ["Notes", "Notes"],
      ["Review", "Weekly review"],
      ["Search", "Search"],
      ["Settings", "Settings"],
    ]) {
      const sheet = await openMore(page);
      await sheet.getByRole("link", { name: label, exact: true }).click();
      await expect(sheet).toHaveCount(0);
      await expect(heading(page, title)).toBeVisible();
      await expect(moreTrigger(page)).toHaveAttribute("aria-current", "true");
    }

    const sheet = await openMore(page);
    await expect(
      sheet.getByRole("heading", { name: "More", exact: true }),
    ).toBeVisible();
    await expect(sheet.getByRole("link", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(sheet.getByText("Ada", { exact: true })).toBeVisible();
    await expect(sheet.getByRole("button", { name: "Sign out" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toHaveCount(0);
    await expect(moreTrigger(page)).toBeFocused();

    await page.goto("/notes/archived");
    const notesSheet = await openMore(page);
    await expect(
      notesSheet.getByRole("link", { name: "Notes" }),
    ).toHaveAttribute("aria-current", "true");
    await page.keyboard.press("Escape");
    await page.getByRole("link", { name: "Search", exact: true }).tap();
    await expect(heading(page, "Search")).toBeVisible();
    await expect(
      page.getByRole("searchbox", { name: "Search notes, goals and tasks" }),
    ).toHaveCount(0);
  });

  test("Create captures a task, restores focus and opens the note editor", async ({
    page,
  }) => {
    await signInAndConfirm(page);
    const create = page.getByRole("button", { name: "Create", exact: true });
    const dialog = await openQuickAdd(page);
    const title = dialog.getByLabel("Task title");
    await expect(title).toBeFocused();
    await title.fill("Collect library holds");
    await title.press("Enter");
    await expect(dialog).toHaveCount(0);
    await expect(
      page.getByText("Added to Inbox", { exact: true }),
    ).toBeVisible();
    await expect(create).toBeFocused();
    await page.goto("/plan/inbox");
    await expect(
      page.getByRole("checkbox", { name: "Collect library holds" }),
    ).toBeVisible();

    await create.press("q");
    await expect(dialog).toBeVisible();
    await title.press("q");
    await expect(title).toHaveValue("q");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);

    await create.click();
    await page.getByRole("menuitem", { name: "New note" }).click();
    await expect(page).toHaveURL(/\/notes\/new$/);
    await expect(create).toBeHidden();
    await expect(mainNav(page)).toBeVisible();

    await openMore(page);
    await page
      .getByRole("dialog", { name: "More" })
      .getByRole("link", { name: "Review", exact: true })
      .click();
    await expect(
      page.getByRole("navigation", { name: "Review steps" }),
    ).toBeVisible();
    await expect(create).toBeHidden();
  });

  test("the bar and FAB clear the page end and hide for the on-screen keyboard", async ({
    page,
  }) => {
    await signInAndConfirm(page);
    await page.goto("/settings");
    const create = page.locator(".compact-create button");
    const nav = page.locator(".navigation-bar");
    const appBar = page.locator(".top-app-bar");
    await expect(appBar).toHaveAttribute("data-scrolled", "false");
    const lastLink = page.getByRole("link", {
      name: "Delete account",
      exact: true,
    });
    await expect(lastLink).toBeVisible();
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight),
    );
    await expect(appBar).toHaveAttribute("data-scrolled", "true");
    const lastBox = (await lastLink.boundingBox())!;
    expect(lastBox.y + lastBox.height).toBeLessThanOrEqual(
      (await create.boundingBox())!.y,
    );
    expect((await create.boundingBox())!.y + 56).toBeLessThan(
      (await nav.boundingBox())!.y,
    );

    const dialog = await openQuickAdd(page);
    await expect(dialog.getByLabel("Task title")).toBeFocused();
    await page.evaluate(() => {
      Object.defineProperty(visualViewport!, "height", {
        configurable: true,
        value: 420,
      });
      visualViewport!.dispatchEvent(new Event("resize"));
    });
    await expect(nav).toBeHidden();
    await expect(create).toBeHidden();
    const submit = (await dialog
      .getByRole("button", { name: "Add", exact: true })
      .boundingBox())!;
    expect(submit.y + submit.height).toBeLessThanOrEqual(420);
    await page.evaluate(() => {
      Reflect.deleteProperty(visualViewport!, "height");
      visualViewport!.dispatchEvent(new Event("resize"));
    });
    await page.keyboard.press("Escape");
    await expect(nav).toBeVisible();
    await expect(create).toBeFocused();
  });
});

test.describe("expanded rail", () => {
  test.use({ viewport: desktop });

  test("every destination and each Plan page is reachable from the rail", async ({
    page,
  }) => {
    await signInAndConfirm(page);
    const nav = mainNav(page);
    const rail = page.getByRole("complementary");
    await expect(rail).toHaveCSS("width", "256px");
    expect((await rail.boundingBox())!.x + 256).toBe(
      (await page.getByRole("main").boundingBox())!.x,
    );
    for (const [label, title] of [
      ["Goals", "Goals"],
      ["Track", "Track"],
      ["Notes", "Notes"],
      ["Review", "Weekly review"],
      ["Settings", "Settings"],
      ["Home", "Home"],
      ["Plan", "All tasks"],
    ]) {
      const link = nav.getByRole("link", { name: label, exact: true });
      await link.click();
      await expect(heading(page, title)).toBeVisible();
      await expect(link).toHaveAttribute(
        "aria-current",
        label === "Plan" ? "true" : "page",
      );
    }
    for (const label of [
      "Today",
      "Upcoming",
      "Calendar",
      "Inbox",
      "All tasks",
    ]) {
      const link = nav.getByRole("link", { name: label, exact: true });
      await link.click();
      await expect(heading(page, label)).toBeVisible();
      await expect(link).toHaveAttribute("aria-current", "page");
      await expect(
        nav.getByRole("link", { name: "Plan", exact: true }),
      ).toHaveAttribute("aria-current", "true");
    }
    await nav.getByRole("link", { name: "Review", exact: true }).click();
    await nav.getByRole("link", { name: "Insights", exact: true }).click();
    await expect(heading(page, "Insights")).toBeVisible();
    await expect(
      nav.getByRole("link", { name: "Review", exact: true }),
    ).toHaveAttribute("aria-current", "true");

    const search = page.getByRole("searchbox", {
      name: "Search notes, goals and tasks",
    });
    await search.fill("library");
    await search.press("Enter");
    await expect(page).toHaveURL(/\/notes\/search$/);
    await expect(page.getByRole("searchbox")).toHaveCount(2);
  });

  test("rail collapse persists and is applied before hydration", async ({
    page,
  }) => {
    await signInAndConfirm(page);
    const rail = page.getByRole("complementary");
    const collapse = page.getByRole("button", {
      name: "Collapse navigation rail",
    });
    const expand = page.getByRole("button", { name: "Expand navigation rail" });
    await collapse.click();
    await expect(rail).toHaveCSS("width", "96px");
    await expect(expand).toBeFocused();
    await expect(
      rail.getByRole("link", { name: "Search", exact: true }),
    ).toBeVisible();

    // External bundles are blocked, so this width comes from server markup and
    // the inline storage script. Hydration cannot correct the first paint.
    const blockBundles = "**/_next/static/**/*.js";
    await page.route(blockBundles, (route) => route.abort());
    await page.reload();
    await expect(rail).toHaveCSS("width", "96px");
    expect((await page.getByRole("main").boundingBox())!.x).toBe(96);
    await page.unroute(blockBundles);

    await page.reload();
    await expand.click();
    await expect(rail).toHaveCSS("width", "256px");
    await page.reload();
    await expect(rail).toHaveCSS("width", "256px");
    await expect(collapse).toBeVisible();
  });
});

for (const viewport of [compact, desktop]) {
  test.describe(`shell at ${viewport.width}px`, () => {
    test.use({ viewport });

    test("the time-zone gate has no navigation and the skip link focuses main", async ({
      page,
    }) => {
      await signInForTest(page, "Ada");
      await page.goto("/home");
      await expect(heading(page, "Confirm your time zone")).toBeVisible();
      await expect(mainNav(page)).toHaveCount(0);
      await expect(
        page.getByRole("button", { name: "Create", exact: true }),
      ).toHaveCount(0);
      await expectNoSeriousViolations(page);
      await page.getByRole("button", { name: "Confirm and continue" }).click();
      await expect(heading(page, "Home")).toBeVisible();
      await page.reload();
      await expect(heading(page, "Home")).toBeVisible();
      await page.keyboard.press("Tab");
      await expect(
        page.getByRole("link", { name: "Skip to content" }),
      ).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(page.getByRole("main")).toBeFocused();
    });

    for (const colorScheme of ["light", "dark"] as const) {
      test(`axe checks the shell in ${colorScheme}`, async ({ page }) => {
        await page.addInitScript(
          ({ key, theme }) => localStorage.setItem(key, theme),
          { key: THEME_STORAGE_KEY, theme: colorScheme },
        );
        await signInAndConfirm(page);
        await expectNoSeriousViolations(page);
        if (viewport.width === compact.width) {
          await openMore(page);
          await expectNoSeriousViolations(page);
          await page.keyboard.press("Escape");
        }
        await openQuickAdd(page);
        await expectNoSeriousViolations(page);
      });
    }
  });
}

test("unknown pages show the not-found page", async ({ page }) => {
  const response = await page.goto("/no-such-page");
  expect(response?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { level: 1, name: "Page not found" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to Home" })).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("the web app manifest and its icons are served", async ({
  page,
  request,
}) => {
  await page.goto("/");
  const href = await page.locator('link[rel="manifest"]').getAttribute("href");
  expect(href).toBe("/manifest.webmanifest");

  const manifest = await (await request.get(href!)).json();
  expect(manifest).toMatchObject({
    name: "SoleUp",
    start_url: "/home",
    display: "standalone",
  });
  const sizes = manifest.icons.map(
    (icon: { sizes: string; purpose?: string }) =>
      `${icon.sizes}${icon.purpose ? ` ${icon.purpose}` : ""}`,
  );
  expect(sizes).toEqual(["192x192", "512x512", "512x512 maskable"]);

  for (const icon of manifest.icons as { src: string }[]) {
    const response = await request.get(icon.src);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("image/png");
  }
  expect((await request.get("/apple-icon.png")).status()).toBe(200);
});
