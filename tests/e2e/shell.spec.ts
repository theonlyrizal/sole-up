import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

const NAV_LABELS = ["Home", "Goals", "Plan", "Settings"];
/** The sidebar also lists Today and Inbox under Plan. */
const SIDEBAR_LABELS = ["Home", "Goals", "Plan", "Today", "Inbox", "Settings"];

function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Main" });
}

test.describe("desktop", () => {
  test("the sidebar shows only Home, Goals, Plan (with Today and Inbox) and Settings", async ({
    page,
  }) => {
    await signInAndConfirm(page);

    const nav = mainNav(page);
    await expect(nav.getByRole("link")).toHaveText(SIDEBAR_LABELS);
    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    // A sidebar: to the left of the content, not along the bottom.
    const navBox = (await nav.boundingBox())!;
    const mainBox = (await page.locator("main").boundingBox())!;
    expect(navBox.x + navBox.width).toBeLessThanOrEqual(mainBox.x);

    for (const label of ["Goals", "Plan", "Settings"]) {
      await nav.getByRole("link", { name: label }).click();
      await expect(
        page.getByRole("heading", { level: 1, name: label }),
      ).toBeVisible();
      await expect(nav.getByRole("link", { name: label })).toHaveAttribute(
        "aria-current",
        "page",
      );
      await expect(nav.locator("[aria-current]")).toHaveCount(1);
    }

    // On Inbox, Plan is the current section and Inbox the current page.
    await nav.getByRole("link", { name: "Inbox" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Inbox" }),
    ).toBeVisible();
    await expect(nav.getByRole("link", { name: "Inbox" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("link", { name: "Plan" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });

  test("the shell has no serious accessibility violations", async ({
    page,
  }) => {
    await signInAndConfirm(page);
    await expectNoSeriousViolations(page);

    for (const path of [
      "/goals",
      "/plan",
      "/plan/today",
      "/plan/inbox",
      "/settings",
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoSeriousViolations(page);
    }
  });

  test("the shell works with the keyboard alone", async ({ page }) => {
    await signInAndConfirm(page);
    await page.goto("/home");
    await expect(
      page.getByRole("heading", { level: 1, name: "Home" }),
    ).toBeVisible();

    // The first Tab reaches the skip link, which moves focus to the content.
    await page.keyboard.press("Tab");
    const skipLink = page.getByRole("link", { name: "Skip to content" });
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();

    // From the top: skip link, brand, Add task, the destinations (with
    // Today and Inbox under Plan), sign out.
    await page.goto("/home");
    await expect(
      page.getByRole("heading", { level: 1, name: "Home" }),
    ).toBeVisible();
    const expected = [
      skipLink,
      page.getByRole("link", { name: "SoleUp" }),
      page.getByRole("button", { name: "Add task" }),
      ...SIDEBAR_LABELS.map((label) =>
        mainNav(page).getByRole("link", { name: label }),
      ),
      page.getByRole("button", { name: "Sign out" }),
    ];
    for (const target of expected) {
      await page.keyboard.press("Tab");
      await expect(target).toBeFocused();
      // Focus is visible, not just present.
      const outline = await target.evaluate(
        (element) => getComputedStyle(element).outlineStyle,
      );
      expect(outline).not.toBe("none");
    }

    // Shift+Tab back to Plan (past Settings, Inbox and Today) and follow
    // it with Enter.
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    const plan = mainNav(page).getByRole("link", { name: "Plan" });
    await expect(plan).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/plan$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Plan" }),
    ).toBeVisible();
    await expect(plan).toHaveAttribute("aria-current", "page");
  });

  test("navigation is hidden until the time zone is confirmed", async ({
    page,
  }) => {
    const response = await page.request.post("/api/test/sign-in", {
      data: { email: `e2e-${randomUUID()}@example.test`, name: "Ada" },
    });
    expect(response.status()).toBe(200);
    await page.goto("/home");
    await expect(
      page.getByRole("heading", { level: 1, name: "Confirm your time zone" }),
    ).toBeVisible();
    await expect(mainNav(page)).toHaveCount(0);
    await expectNoSeriousViolations(page);
  });
});

test.describe("mobile", () => {
  test.use({ viewport: { width: 375, height: 812 }, hasTouch: true });

  test("navigation is a bottom bar, and the shell has no serious accessibility violations", async ({
    page,
  }) => {
    await signInAndConfirm(page);

    // Inbox isn't in the bottom bar; the Plan pages link to it.
    const nav = mainNav(page);
    await expect(nav.getByRole("link")).toHaveText(NAV_LABELS);
    const navBox = (await nav.boundingBox())!;
    expect(navBox.width).toBe(375);
    expect(Math.round(navBox.y + navBox.height)).toBe(812);

    // Every destination is a comfortable touch target.
    for (const link of await nav.getByRole("link").all()) {
      const box = (await link.boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(box.width).toBeGreaterThanOrEqual(44);
    }

    await nav.getByRole("link", { name: "Goals" }).tap();
    await expect(
      page.getByRole("heading", { level: 1, name: "Goals" }),
    ).toBeVisible();
    await expectNoSeriousViolations(page);
  });
});

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
