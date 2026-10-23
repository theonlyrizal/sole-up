import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// The Agenda (chunk 4.5): events, planned tasks and timed deadlines in date
// order on the user's local days, the range in the URL, and each item
// opening its dialog from the keyboard. The browser (and so the confirmed
// time zone) is in Tokyo, where early morning is the day before in UTC.

const TOKYO = "Asia/Tokyo";
test.use({ timezoneId: TOKYO });

/** The user's date `days` from today in Tokyo (no DST there). */
function tokyoDate(days = 0): string {
  const at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TOKYO }).format(at);
}

/** One day of the Agenda, found by its heading's `<time>`. */
function day(page: Page, date: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.locator(`h2 time[datetime="${date}"]`) });
}

/** An item's button on a day. */
function item(page: Page, date: string, title: string) {
  return day(page, date).getByRole("button", { name: title, exact: true });
}

/** The row holding an item. */
function row(page: Page, date: string, title: string) {
  return day(page, date)
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: title, exact: true }) });
}

async function openAgenda(page: Page, path = "/plan/calendar") {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: "Calendar" }),
  ).toBeVisible();
}

/** Quick add with an optional planned date. */
async function addTask(page: Page, title: string, plannedDate?: string) {
  const dialog = page.getByRole("dialog", { name: "Add task" });
  // The button only opens the dialog once the page hydrates; retry until then.
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: "Add task" }).click();
    }
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await dialog.getByLabel("Title").fill(title);
  if (plannedDate) {
    await dialog.getByRole("button", { name: "More options" }).click();
    await dialog.getByLabel("Plan for").fill(plannedDate);
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

/** A one-off event through the New event dialog. */
async function addEvent(
  page: Page,
  title: string,
  date: string,
  start: string,
) {
  const dialog = page.getByRole("dialog", { name: "New event" });
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: "New event" }).click();
    }
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Start date").fill(date);
  await dialog.getByLabel("Start time").fill(start);
  await dialog.getByRole("button", { name: "Add event" }).click();
  await expect(dialog).toHaveCount(0);
}

test("an empty range is calm, and the range survives a refresh", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await openAgenda(page);
  const counts = page.getByRole("navigation", { name: "Days to show" });
  await expect(counts.getByRole("link")).toHaveText([
    "7 days",
    "14 days",
    "30 days",
  ]);
  await expect(counts.getByRole("link", { name: "30 days" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    page.getByRole("heading", { level: 2, name: "Nothing in these days" }),
  ).toBeVisible();
  await expectNoSeriousViolations(page);

  await counts.getByRole("link", { name: "7 days" }).click();
  await expect(page).toHaveURL(/\/plan\/calendar\?days=7$/);
  const move = page.getByRole("navigation", {
    name: "Move through the agenda",
  });
  await move.getByRole("link", { name: "Next 7 days" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/plan/calendar\\?start=${tokyoDate(7)}&days=7$`),
  );
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 1, name: "Calendar" }),
  ).toBeVisible();
  await expect(counts.getByRole("link", { name: "7 days" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(
    move.getByRole("link", { name: "From today" }),
  ).not.toHaveAttribute("aria-current");
  await move.getByRole("link", { name: "From today" }).click();
  await expect(page).toHaveURL(/\/plan\/calendar\?days=7$/);
});

test("events, plans and timed deadlines on their Tokyo days, opened from the keyboard", async ({
  page,
}) => {
  test.slow();
  await signInAndConfirm(page);
  await addTask(page, "Renew passport", tokyoDate(2));
  await addTask(page, "Pay rent");
  // 00:30 in Tokyo is still the day before in UTC.
  await setTimedDeadline(page, "Pay rent", tokyoDate(3), "00:30");
  await openAgenda(page);
  await addEvent(page, "Dentist", tokyoDate(3), "09:00");

  await expect(row(page, tokyoDate(2), "Renew passport")).toContainText(
    "Planned task",
  );
  await expect(row(page, tokyoDate(3), "Pay rent")).toContainText(
    "Due 12:30 AM",
  );
  await expect(row(page, tokyoDate(3), "Dentist")).toContainText(
    "9:00 AM – 10:00 AM",
  );
  await expect(item(page, tokyoDate(2), "Pay rent")).toHaveCount(0);
  // In date and time order: the deadline at 00:30 before the 09:00 event.
  await expect(day(page, tokyoDate(3)).getByRole("button")).toHaveText([
    "Pay rent",
    "Dentist",
  ]);
  await expectNoSeriousViolations(page);

  // Keyboard only: Tab from the last range link reaches the items in order,
  // Enter opens an item's dialog, and Escape returns focus to it.
  await page
    .getByRole("navigation", { name: "Days to show" })
    .getByRole("link", { name: "30 days" })
    .focus();
  await page.keyboard.press("Tab");
  await expect(item(page, tokyoDate(2), "Renew passport")).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(item(page, tokyoDate(3), "Pay rent")).toBeFocused();
  await page.keyboard.press("Enter");
  const task = page.getByRole("dialog", { name: "Edit task" });
  await expect(task).toBeVisible();
  await expect(task.getByLabel("Title")).toHaveValue("Pay rent");
  await expectNoSeriousViolations(page);
  await page.keyboard.press("Escape");
  await expect(task).toHaveCount(0);
  await expect(item(page, tokyoDate(3), "Pay rent")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(item(page, tokyoDate(3), "Dentist")).toBeFocused();
  await page.keyboard.press("Enter");
  const event = page.getByRole("dialog", { name: "Edit event" });
  await expect(event).toBeVisible();
  await expect(event.getByLabel("Title")).toHaveValue("Dentist");
  await page.keyboard.press("Escape");
  await expect(event).toHaveCount(0);
  await expect(item(page, tokyoDate(3), "Dentist")).toBeFocused();

  // The range and its items survive a refresh.
  await openAgenda(page, "/plan/calendar?days=7");
  await page.reload();
  await expect(item(page, tokyoDate(3), "Dentist")).toBeVisible();
  await expect(item(page, tokyoDate(2), "Renew passport")).toBeVisible();
});

test("dark theme and phone width use the app's tokens and fit the screen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: "dark" });
  await signInAndConfirm(page);
  await addTask(page, "Renew passport", tokyoDate(1));
  await openAgenda(page);
  await addEvent(page, "Dentist", tokyoDate(1), "09:00");
  await expect(item(page, tokyoDate(1), "Dentist")).toBeVisible();
  await expect(item(page, tokyoDate(1), "Renew passport")).toBeVisible();

  // The calendar's surface is the app's dark surface token.
  const surface = await page.evaluate(() =>
    getComputedStyle(document.documentElement)
      .getPropertyValue("--surface")
      .trim(),
  );
  await expect(page.locator(".soleup-calendar")).toHaveCSS(
    "--fc-classic-background",
    surface,
  );
  expect(surface).toBe("#1b1b1a");
  await expectNoSeriousViolations(page);
  // No sideways scrolling on a phone.
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
