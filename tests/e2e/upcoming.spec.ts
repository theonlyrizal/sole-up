import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// The Upcoming view (chunk 2.6): the next week by local date (14 or 30 days
// on their tabs), plans and deadlines merged, the range in the URL. The
// browser (and so the confirmed time zone) is in Tokyo, far from UTC.

const TOKYO = "Asia/Tokyo";
test.use({ timezoneId: TOKYO });

/** The user's date `days` from today in Tokyo (no DST there). */
function tokyoDate(days = 0): string {
  const at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TOKYO }).format(at);
}

/** The section for one local date, found by its heading's `<time>`. */
function day(page: Page, date: string) {
  return page
    .getByRole("region")
    .filter({ has: page.locator(`h2 time[datetime="${date}"]`) });
}

async function openUpcoming(page: Page, path = "/plan/upcoming") {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: "Upcoming" }),
  ).toBeVisible();
}

/** Quick add with an optional planned date and all-day due date. */
async function addTask(
  page: Page,
  title: string,
  options: { plannedDate?: string; dueDate?: string } = {},
) {
  const dialog = page.getByRole("dialog", { name: "Add task" });
  // The button only opens the dialog once the page hydrates; retry until then.
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: "Add task" }).click();
    }
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await dialog.getByLabel("Title").fill(title);
  if (Object.keys(options).length > 0) {
    await dialog.getByRole("button", { name: "More options" }).click();
    if (options.plannedDate) {
      await dialog.getByLabel("Plan for").fill(options.plannedDate);
    }
    if (options.dueDate) await dialog.getByLabel("Due").fill(options.dueDate);
  }
  await dialog.getByLabel("Title").press("Enter");
  await expect(dialog).toHaveCount(0);
}

/** Gives a task a timed deadline with the Plan page's inline editor. */
async function setTimedDeadline(
  page: Page,
  title: string,
  dueDate: string,
  dueTime: string,
) {
  await page.goto("/plan");
  const editor = page.getByRole("form", {
    name: `Dates and goal for ${title}`,
  });
  // The trigger only opens the editor once the page hydrates.
  await expect(async () => {
    if (!(await editor.isVisible())) {
      await page
        .getByRole("button", { name: `Dates and goal: ${title}` })
        .click();
    }
    await expect(editor).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await editor.getByLabel("Due date").fill(dueDate);
  await editor.getByLabel("Due time").fill(dueTime);
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByText("Task updated", { exact: true })).toBeVisible();
}

test("an empty window is calm, and the range tabs live in the URL", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await openUpcoming(page);
  // Within a Week is the default.
  const ranges = page.getByRole("navigation", { name: "Days to show" });
  await expect(ranges.getByRole("link")).toHaveText([
    "Within a Week",
    "Next 14 days",
    "Next 30 days",
  ]);
  await expect(
    ranges.getByRole("link", { name: "Within a Week" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { level: 2, name: "Nothing within a week" }),
  ).toBeVisible();
  await expectNoSeriousViolations(page);

  await page.getByRole("link", { name: "Show the next 14 days" }).click();
  await expect(page).toHaveURL(/\/plan\/upcoming\?days=14$/);
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Nothing in the next 14 days",
    }),
  ).toBeVisible();
  await expect(
    ranges.getByRole("link", { name: "Next 14 days" }),
  ).toHaveAttribute("aria-current", "page");

  await page.getByRole("link", { name: "Show the next 30 days" }).click();
  await expect(page).toHaveURL(/\/plan\/upcoming\?days=30$/);
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Nothing in the next 30 days",
    }),
  ).toBeVisible();
  await expect(
    ranges.getByRole("link", { name: "Next 30 days" }),
  ).toHaveAttribute("aria-current", "page");

  // Upcoming sits under Plan, between Today and Inbox.
  await expect(
    page.getByRole("navigation", { name: "Plan" }).getByRole("link"),
  ).toHaveText(["All tasks", "Today", "Upcoming", "Inbox"]);
});

test("plans and deadlines land on their local days, a timed one included", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await addTask(page, "Renew passport", {
    plannedDate: tokyoDate(2),
    dueDate: tokyoDate(5),
  });
  await addTask(page, "Pack bags", {
    plannedDate: tokyoDate(4),
    dueDate: tokyoDate(4),
  });
  await addTask(page, "Water the plants", { plannedDate: tokyoDate(0) });
  await addTask(page, "Send the forms", { dueDate: tokyoDate(10) });
  await addTask(page, "Book flights", { dueDate: tokyoDate(20) });
  await addTask(page, "Call the dentist");
  // 00:30 in Tokyo is 15:30 UTC the day before, so a UTC-date bug would
  // show it a day early.
  await setTimedDeadline(page, "Call the dentist", tokyoDate(3), "00:30");

  await openUpcoming(page);
  await expect(page.getByRole("heading", { level: 2 })).toHaveCount(4);

  const dentistDay = day(page, tokyoDate(3));
  await expect(dentistDay.getByText("Call the dentist")).toBeVisible();
  await expect(dentistDay.getByText(/^Due 12:30\sAM$/)).toBeVisible();
  await expect(
    day(page, tokyoDate(2)).getByText("Call the dentist"),
  ).toHaveCount(0);

  // A plan and a deadline on different days show on each; on the same day
  // they're one entry.
  await expect(
    day(page, tokyoDate(2)).getByText("Renew passport"),
  ).toBeVisible();
  await expect(
    day(page, tokyoDate(2)).getByText(/^Planned · Due /),
  ).toBeVisible();
  await expect(
    day(page, tokyoDate(5)).getByText(/^Due · Planned /),
  ).toBeVisible();
  await expect(day(page, tokyoDate(4)).getByRole("listitem")).toHaveCount(1);
  await expect(
    day(page, tokyoDate(4)).getByText("Planned, due", { exact: true }),
  ).toBeVisible();

  // Today's plan is on Today; day 10 is past the week, day 20 past 14 days.
  await expect(page.getByText("Water the plants")).toHaveCount(0);
  await expect(page.getByText("Send the forms")).toHaveCount(0);
  await expect(page.getByText("Book flights")).toHaveCount(0);
  await expectNoSeriousViolations(page);

  const ranges = page.getByRole("navigation", { name: "Days to show" });
  await ranges.getByRole("link", { name: "Next 14 days" }).click();
  await expect(page).toHaveURL(/\?days=14$/);
  await expect(
    day(page, tokyoDate(10)).getByText("Send the forms"),
  ).toBeVisible();
  await expect(page.getByText("Book flights")).toHaveCount(0);

  // The next 30 days include it, and the choice survives a reload.
  await ranges.getByRole("link", { name: "Next 30 days" }).click();
  await expect(page).toHaveURL(/\?days=30$/);
  await expect(
    day(page, tokyoDate(20)).getByText("Book flights"),
  ).toBeVisible();
  await page.reload();
  await expect(
    day(page, tokyoDate(20)).getByText("Book flights"),
  ).toBeVisible();
  await expect(
    day(page, tokyoDate(3)).getByText(/^Due 12:30\sAM$/),
  ).toBeVisible();
});
