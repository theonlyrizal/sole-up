import { randomUUID } from "node:crypto";

import { expect, test, type Page } from "@playwright/test";

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
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");

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
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(page.getByLabel("Time zone")).toHaveValue("Asia/Tokyo");
  await expect(page.getByText(/This device is set to/)).toHaveCount(0);
});
