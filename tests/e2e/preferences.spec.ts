import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

import { signInAndConfirm } from "./helpers";

/** Settings' "Time and region" section (Reminders has its own Save). */
const timeAndRegion = (page: Page) =>
  page.getByRole("region", { name: "Time and region" });

// The browser reports this zone and language, as a real device would.
test.use({ timezoneId: "Asia/Tokyo", locale: "en-GB" });

async function signInAsNewUser(page: Page) {
  const response = await page.request.post("/api/test/sign-in", {
    data: { email: `e2e-${randomUUID()}@example.test`, name: "Grace Hopper" },
  });
  expect(response.status()).toBe(200);
}

test("first sign-in proposes the device's time zone and waits for confirmation", async ({
  page,
}) => {
  await signInAsNewUser(page);

  await page.goto("/home");
  await expect(
    page.getByRole("heading", { level: 1, name: "Confirm your time zone" }),
  ).toBeVisible();
  // Nothing else renders until the zone is confirmed.
  await expect(page.getByRole("heading", { name: "Home" })).toHaveCount(0);
  await expect(page.getByLabel("Time zone")).toHaveValue("Asia/Tokyo");
  await expect(page.getByLabel("Language and region")).toHaveValue("en-GB");
  await expect(page.getByLabel("Week starts on")).toHaveValue("1");

  // Proposed, not stored: other pages still ask after a reload.
  await page.goto("/settings");
  await expect(
    page.getByRole("heading", { level: 1, name: "Confirm your time zone" }),
  ).toBeVisible();

  await page.getByLabel("Time zone").selectOption("Europe/Lisbon");
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" }),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Time zone")).toHaveValue("Europe/Lisbon");
});

test("settings round-trip: time zone, locale and week start", async ({
  page,
}) => {
  await signInAsNewUser(page);
  await page.goto("/home");
  await page.getByRole("button", { name: "Confirm and continue" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Home" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Settings" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByLabel("Time zone")).toHaveValue("Asia/Tokyo");

  await page.getByLabel("Time zone").selectOption("America/New_York");
  await page.getByLabel("Language and region").selectOption("de-DE");
  await page.getByLabel("Week starts on").selectOption({ label: "Sunday" });
  await timeAndRegion(page).getByRole("button", { name: "Save" }).click();
  await expect(timeAndRegion(page).getByRole("status")).toHaveText("Saved");

  // A device zone different from the saved one is pointed out, not applied.
  await expect(
    page.getByText("This device is set to Asia/Tokyo."),
  ).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("Time zone")).toHaveValue("America/New_York");
  await expect(page.getByLabel("Language and region")).toHaveValue("de-DE");
  await expect(page.getByLabel("Week starts on")).toHaveValue("0");

  await page.getByRole("button", { name: "Use it" }).click();
  await expect(page.getByLabel("Time zone")).toHaveValue("Asia/Tokyo");
  await timeAndRegion(page).getByRole("button", { name: "Save" }).click();
  await expect(timeAndRegion(page).getByRole("status")).toHaveText("Saved");
  await page.reload();
  await expect(page.getByLabel("Time zone")).toHaveValue("Asia/Tokyo");
  await expect(page.getByText(/This device is set to/)).toHaveCount(0);
});

test("Settings search jumps by keyboard and keeps unsaved changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAndConfirm(page);
  await page.goto("/settings");
  const index = page.getByRole("navigation", { name: "On this page" });
  const language = page.getByLabel("Language and region");
  const search = page.getByRole("searchbox", { name: "Search settings" });
  await search.fill("dark mode");
  await expect(index.getByRole("link")).toHaveCount(1);
  await language.selectOption("de-DE");
  await expect(language).toHaveValue("de-DE");
  await index.getByRole("link", { name: "Appearance" }).press("Enter");
  await expect(page).toHaveURL(/#appearance$/);
  await expect(page.locator("#appearance")).toBeFocused();
  await expect(language).toHaveValue("de-DE");
  await search.fill("qwerty");
  await expect(index.getByRole("status")).toHaveText(
    "No matching settings. Try a different search.",
  );
  await search.press("Escape");
  await expect(index.getByRole("link")).toHaveCount(6);
  await expect(language).toHaveValue("de-DE");
  await page.getByRole("link", { name: "Open account" }).click();
  await expect(page).toHaveURL(/\/account$/);
});

test("Appearance applies immediately, persists per device, and returns control to the system", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await signInAndConfirm(page);
  await page.goto("/settings#appearance");

  const group = page.getByRole("radiogroup", { name: "Color theme" });
  const root = page.locator("html");
  const dark = group.getByRole("radio", { name: "Dark" });
  const light = group.getByRole("radio", { name: "Light" });
  const system = group.getByRole("radio", { name: "System" });

  await expect(light).toBeChecked();
  await dark.press("Space");
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(dark).toBeChecked();
  await expect(
    page
      .getByRole("navigation", { name: "On this page" })
      .getByText("Dark", { exact: true }),
  ).toBeVisible();

  await page.reload();
  await expect(root).toHaveAttribute("data-theme", "dark");
  await expect(dark).toBeChecked();

  await system.press("Space");
  await expect(root).not.toHaveAttribute("data-theme");
  await expect(system).toBeChecked();
  await expect(root).toHaveCSS("color-scheme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(root).toHaveCSS("color-scheme", "dark");

  await page.reload();
  await expect(root).not.toHaveAttribute("data-theme");
  await expect(system).toBeChecked();
  await expect(root).toHaveCSS("color-scheme", "dark");

  await light.click();
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(root).toHaveCSS("color-scheme", "light");
});

test("time and region and reminders save independently", async ({ page }) => {
  await signInAndConfirm(page);
  await page.goto("/settings");
  const region = timeAndRegion(page);
  const reminders = page.getByRole("form", { name: "Reminder settings" });
  const privacy = reminders.getByRole("switch", {
    name: "Private notifications",
  });
  const locale = region.getByLabel("Language and region");

  await privacy.click();
  await expect(privacy).toBeChecked();
  await locale.selectOption("de-DE");
  await region.getByRole("button", { name: "Save", exact: true }).click();
  await expect(region.getByRole("status")).toHaveText("Saved");
  await expect(privacy).toBeChecked();
  await page.reload();
  await expect(locale).toHaveValue("de-DE");
  await expect(privacy).not.toBeChecked();

  await privacy.click();
  await expect(privacy).toBeChecked();
  await locale.selectOption("en-GB");
  await expect(locale).toHaveValue("en-GB");
  await reminders.getByRole("button", { name: "Save", exact: true }).click();
  await expect(reminders.getByText("Saved", { exact: true })).toBeVisible();
  await expect(locale).toHaveValue("en-GB");
  await page.reload();
  await expect(locale).toHaveValue("de-DE");
  await expect(privacy).toBeChecked();
});
