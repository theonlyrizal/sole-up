import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// Home's Habits card (chunk 6.6): each active habit with its own last-4-weeks
// figure and this week's progress, from the 6.2 engine, linking to its row
// on Track. No combined number across habits. The browser (and so the
// confirmed time zone) is in Tokyo.

const TOKYO = "Asia/Tokyo";
test.use({ timezoneId: TOKYO });

/** The user's date `days` from today in Tokyo (no DST there). */
function tokyoDate(days = 0): string {
  const at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TOKYO }).format(at);
}

function habitsCard(page: Page) {
  return page.getByRole("region", { name: "Habits", exact: true });
}

function toastSaying(page: Page, title: string) {
  return page
    .getByRole("region", { name: /^Notifications/ })
    .getByRole("listitem")
    .filter({ hasText: title });
}

async function openHome(page: Page) {
  await page.goto("/home");
  await expect(
    page.getByRole("heading", { level: 1, name: "Home" }),
  ).toBeVisible();
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

test("Home lists each active habit's figure and links to it on Track", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await openHome(page);

  // Nothing to look at yet.
  const empty = habitsCard(page);
  await expect(empty.getByText("Nothing yet", { exact: true })).toBeVisible();
  await expect(empty.getByText(/Range:.+ to .+/)).toBeVisible();
  await expect(
    empty.getByRole("link", { name: "Add a habit" }),
  ).toHaveAttribute("href", "/track");

  // Started today, done today: one of one.
  await createHabit(page, "Stretch", tokyoDate());
  await createHabit(page, "Read", tokyoDate());
  await page.goto("/plan/today");
  await page.getByRole("button", { name: "Done: Stretch" }).click();
  await expect(toastSaying(page, "Marked done").first()).toBeVisible();

  await openHome(page);
  const card = habitsCard(page);
  const list = card.getByRole("list", { name: "Active habits" });
  await expect(list.getByRole("link")).toHaveText(["Stretch", "Read"]);
  const stretch = list.getByRole("listitem").filter({ hasText: "Stretch" });
  await expect(stretch).toContainText("Last 4 weeks: 1 of 1 day");
  await expect(stretch).toContainText(/1 of \d days? so far this week/);
  // Read isn't logged today, so nothing is expected of it yet.
  const read = list.getByRole("listitem").filter({ hasText: "Read" });
  await expect(read).toContainText(
    "Last 4 weeks: Nothing expected in this range",
  );
  await expect(card).toContainText("Each active habit on its own");
  await expect(card.getByText("Nothing yet")).toHaveCount(0);

  // Each habit keeps its own figure: no percentage, score or total.
  const main = page.getByRole("main");
  await expect(main).not.toContainText("%");
  await expect(main).not.toContainText(/score|streak/i);
  await expect(card).not.toContainText(/1 of 2/);
  await expectNoSeriousViolations(page);

  // The title links to the habit's row on Track.
  const link = list.getByRole("link", { name: "Stretch" });
  await expect(link).toHaveAttribute("href", /^\/track#habit-[0-9a-f-]+$/);
  const anchor = (await link.getAttribute("href"))!.split("#")[1]!;
  await link.click();
  await expect(page).toHaveURL(new RegExp(`/track#${anchor}$`));
  const row = page.locator(`#${anchor}`);
  await expect(
    row.getByRole("heading", { name: "Stretch", exact: true }),
  ).toBeVisible();
  await expect(row).toBeInViewport();

  // A paused habit leaves the card; with none active it says nothing yet.
  const paused = page.getByRole("region", { name: "Paused" });
  for (const title of ["Read", "Stretch"]) {
    await page.getByRole("button", { name: `Pause: ${title}` }).click();
    await expect(
      paused.getByRole("heading", { name: title, exact: true }),
    ).toBeVisible();
  }
  await openHome(page);
  await expect(
    habitsCard(page).getByText("Nothing yet", { exact: true }),
  ).toBeVisible();
});
