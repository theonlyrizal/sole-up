import { THEME_STORAGE_KEY } from "../../src/lib/theme";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

const publicPages = [
  ["/", "SoleUp"],
  ["/sign-in", "Sign in to SoleUp"],
  ["/privacy", "Privacy notes"],
] as const;

// Record-backed detail pages and populated states are scanned by the goal,
// notes, review-history and insights specs. Those tests create the records.
const signedInPages = [
  ["/home", "Home"],
  ["/goals", "Goals"],
  ["/goals/areas", "Life areas"],
  ["/goals/archived", "Archived goals"],
  ["/goals/missing", "Goal not found"],
  ["/plan", "Plan"],
  ["/plan/today", "Today"],
  ["/plan/upcoming", "Upcoming"],
  ["/plan/calendar", "Calendar"],
  ["/plan/inbox", "Inbox"],
  ["/track", "Track"],
  ["/track/archived", "Archived habits"],
  ["/notes", "Notes"],
  ["/notes/archived", "Archived notes"],
  ["/notes/new", "Note"],
  ["/notes/search", "Search"],
  ["/notes/tags", "Tags"],
  ["/notes/missing", "Note not found"],
  ["/review", "Weekly review"],
  ["/review/history", "Past reviews"],
  ["/review/history/missing", "Review not found"],
  ["/review/insights", "Insights"],
  ["/review/insights/missing", "Insight not found"],
  ["/settings", "Settings"],
  ["/settings/delete-account", "Delete account"],
] as const;

for (const [requiresSignIn, routes] of [
  [false, publicPages],
  [true, signedInPages],
] as const) {
  for (const [path, title] of routes) {
    test(`axe scans ${path} in light and dark mode`, async ({ page }) => {
      await page.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );
      await page.emulateMedia({ colorScheme: "light" });
      if (requiresSignIn) await signInAndConfirm(page);
      await page.goto(path);
      await expect(
        page.getByRole("heading", { level: 1, name: title, exact: true }),
      ).toBeVisible();
      await expect(page.getByRole("main")).toHaveCount(1);
      await expect(
        page.getByRole("status").filter({ hasText: /^Loading/ }),
      ).toHaveCount(0);
      if (path === "/sign-in") {
        await expect(
          page.getByRole("button", { name: "Continue with GitHub" }),
        ).toBeVisible();
      }
      if (path === "/notes/new") {
        await expect(
          page.getByRole("textbox", { name: "Note", exact: true }),
        ).toBeEditable();
      }

      await test.step("light mode", () => expectNoSeriousViolations(page));
      await page.emulateMedia({ colorScheme: "dark" });
      await test.step("dark mode", () => expectNoSeriousViolations(page));
    });
  }
}

test("axe scans the hovered primary and danger buttons", async ({ page }) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, "system"),
    THEME_STORAGE_KEY,
  );
  await signInAndConfirm(page);
  for (const colorScheme of ["light", "dark"] as const) {
    await test.step(colorScheme, async () => {
      await page.emulateMedia({ colorScheme });
      await scanHovered(
        page,
        page.getByRole("button", { name: "Add task", exact: true }),
      );

      await page.goto("/settings");
      await scanHovered(
        page,
        page.getByRole("link", { name: "Delete account", exact: true }),
      );
    });
  }
});

async function scanHovered(page: Page, control: Locator) {
  await page.mouse.move(0, 0);
  const background = await control.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await control.hover();
  await expectNoSeriousViolations(page);
  await expect(control).not.toHaveCSS("background-color", background);
}
