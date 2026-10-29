import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// Track's history (chunk 6.5): the last 4 weeks by default, the last 12 or
// this week alone, kept in the URL; each habit's strip by week with its
// figure and the definition beside it; this week as progress, not a figure.
// The browser (and so the confirmed time zone) is in Tokyo, far from UTC.

const TOKYO = "Asia/Tokyo";
test.use({ timezoneId: TOKYO });

/** The user's date `days` from today in Tokyo (no DST there). */
function tokyoDate(days = 0): string {
  const at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TOKYO }).format(at);
}

function habitItem(page: Page, title: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

function weekLists(page: Page, title: string) {
  return page.getByRole("list", { name: new RegExp(`^${title}: Week of `) });
}

function rangeLink(page: Page, name: string) {
  return page
    .getByRole("navigation", { name: "Range to show" })
    .getByRole("link", { name, exact: true });
}

async function createHabit(page: Page, title: string, startDate: string) {
  await page.goto("/track");
  await page.getByRole("button", { name: "New habit" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New habit" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Start date").fill(startDate);
  await dialog.getByRole("button", { name: "Add habit" }).click();
  await expect(dialog).toHaveCount(0);
}

test("switch ranges, backfill an old week, and see this week as progress", async ({
  page,
}) => {
  await signInAndConfirm(page);
  // Started well before the oldest of the last 12 weeks.
  await createHabit(page, "Read", tokyoDate(-90));
  const read = habitItem(page, "Read");

  // The default: the last 4 weeks, this week last, the definition shown.
  await expect(rangeLink(page, "Last 4 weeks")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(weekLists(page, "Read")).toHaveCount(4);
  await expect(read).toContainText(/Last 4 weeks: 0 of \d+ days/);
  await expect(read.getByText("How this is counted:")).toBeVisible();
  await expect(read).toContainText("Today counts only once it's logged");
  await expect(read).not.toContainText("%");
  await expect(read).not.toContainText(/streak/i);

  // The last 12 weeks, in the URL.
  await rangeLink(page, "Last 12 weeks").click();
  await expect(page).toHaveURL(/\/track\?range=12w$/);
  await expect(rangeLink(page, "Last 12 weeks")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(weekLists(page, "Read")).toHaveCount(12);
  const figure = read.locator("p").filter({ hasText: /^Last 12 weeks:/ });
  await expect(figure).toHaveText(/^Last 12 weeks: 0 of \d+ days$/);
  await page.mouse.move(0, 0);
  await expectNoSeriousViolations(page);

  // Backfill a day in the oldest week; the range stays and the figure moves.
  const oldest = weekLists(page, "Read").first();
  await oldest
    .getByRole("button", { name: /: Missed$/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: "Done" })).toBeChecked();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(figure).toHaveText(/^Last 12 weeks: 1 of \d+ days$/);
  await expect(oldest.getByRole("button", { name: /: Done$/ })).toHaveCount(1);
  await expect(page).toHaveURL(/\/track\?range=12w$/);

  // Out of the last 4 weeks, so not in that figure.
  await rangeLink(page, "Last 4 weeks").click();
  await expect(page).toHaveURL(/\/track$/);
  await expect(read).toContainText(/Last 4 weeks: 0 of \d+ days/);

  // This week alone: progress so far, never a consistency figure.
  await rangeLink(page, "This week").click();
  await expect(page).toHaveURL(/\/track\?range=week$/);
  await expect(weekLists(page, "Read")).toHaveCount(1);
  await expect(read).toContainText(/0 of 7 days so far this week/);
  await expect(read).not.toContainText(/Last \d+ weeks:/);
  await expect(read).toContainText("This week shows what's done so far");
  await expectNoSeriousViolations(page);

  // An unknown range falls back to the default.
  await page.goto("/track?range=52w");
  await expect(rangeLink(page, "Last 4 weeks")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(weekLists(page, "Read")).toHaveCount(4);
});
