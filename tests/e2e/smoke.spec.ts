import { expect, test } from "@playwright/test";

test("the public home page renders", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle(/SoleUp/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Decide what matters. Plan what's realistic. See how it went.",
    }),
  ).toBeVisible();
});
