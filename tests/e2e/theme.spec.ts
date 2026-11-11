import { expect, test } from "@playwright/test";

import { THEME_STORAGE_KEY } from "../../src/lib/theme";

for (const [choice, colorScheme] of [
  ["dark", "light"],
  ["light", "dark"],
  ["system", "dark"],
  [null, "dark"],
] as const) {
  test(`applies ${choice ?? "the default"} theme without the hydration bundle`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme });
    // Allow the nonce-protected inline script and server HTML to run as usual.
    // Block external scripts so the result cannot come from hydration.
    await page.route("**/_next/static/**/*.js*", (route) => route.abort());
    if (choice !== null) {
      await page.addInitScript(
        ({ key, value }) => localStorage.setItem(key, value),
        { key: THEME_STORAGE_KEY, value: choice },
      );
    }
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const root = page.locator("html");
    if (choice === "light" || choice === "dark") {
      expect(await root.getAttribute("data-theme")).toBe(choice);
    } else {
      expect(await root.getAttribute("data-theme")).toBeNull();
    }
    expect(
      await root.evaluate((element) => getComputedStyle(element).colorScheme),
    ).toBe(choice === "light" || choice === "dark" ? choice : colorScheme);
  });
}
