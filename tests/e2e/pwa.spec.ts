import { expect, test } from "@playwright/test";

import {
  activeServiceWorker,
  expectNoSeriousViolations,
  signInAndConfirm,
} from "./helpers";

const IPHONE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";

test("the service worker is served uncached with a strict policy", async ({
  request,
}) => {
  const response = await request.get("/sw.js");
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers["content-type"]).toBe("application/javascript; charset=utf-8");
  expect(headers["cache-control"]).toContain("no-cache");
  expect(headers["content-security-policy"]).toBe(
    "default-src 'self'; script-src 'self'",
  );
});

test("the service worker registers for the whole app, signed out too", async ({
  page,
  baseURL,
}) => {
  await page.goto("/sign-in");
  expect(await activeServiceWorker(page)).toEqual({
    scope: `${baseURL}/`,
    scriptURL: `${baseURL}/sw.js`,
  });
});

test.describe("install help in Settings", () => {
  test("lists the steps for every device and marks this one", async ({
    page,
  }) => {
    await signInAndConfirm(page);
    await page.goto("/settings");
    const install = page.getByRole("region", { name: "Install the app" });
    await expect(install.getByRole("heading", { level: 3 })).toHaveText([
      "iPhone and iPad",
      "Android",
      "Computer (this device)",
    ]);
    await expect(install).toContainText("Add to Home Screen");
    // Desktop Chrome: no iOS note, not installed.
    await expect(install).not.toContainText("only work after you add");
    await expect(install).not.toContainText("installed app on this device");
    await expectNoSeriousViolations(page);
  });

  test.describe("on an iPhone", () => {
    test.use({ userAgent: IPHONE_USER_AGENT });

    test("explains that notifications need the Home Screen app", async ({
      page,
    }) => {
      await signInAndConfirm(page);
      await page.goto("/settings");
      const install = page.getByRole("region", { name: "Install the app" });
      await expect(
        install.getByRole("heading", { name: "iPhone and iPad (this device)" }),
      ).toBeVisible();
      await expect(install).toContainText(
        "On this device, notifications only work after you add SoleUp to your Home Screen.",
      );
      await expectNoSeriousViolations(page);
    });

    test("says so when opened from the Home Screen", async ({ page }) => {
      await page.addInitScript(() =>
        Object.defineProperty(navigator, "standalone", { value: true }),
      );
      await signInAndConfirm(page);
      await page.goto("/settings");
      const install = page.getByRole("region", { name: "Install the app" });
      await expect(install).toContainText(
        "You're using the installed app on this device.",
      );
      await expect(install).not.toContainText("only work after you add");
    });
  });
});
