import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// The Week and Day views (chunk 4.6): a time grid from the user's week
// start, timed events by local time, an all-day row, timed task deadlines
// as markers, overlapping events side by side, keyboard movement between
// items, the view and day in the URL, and Day standing in for Week on a
// phone. The browser (and so the confirmed time zone) is in Tokyo, where
// early morning is the day before in UTC.

const TOKYO = "Asia/Tokyo";
test.use({ timezoneId: TOKYO });

const DAY_MS = 24 * 60 * 60 * 1000;

/** The user's date `days` from today in Tokyo (no DST there). */
function tokyoDate(days = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TOKYO }).format(
    new Date(Date.now() + days * DAY_MS),
  );
}

/** Day of the week of a date: 0 = Sunday â€¦ 6 = Saturday. */
function weekday(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

/** The first day of the week holding `date`, for a week start. */
function weekStartOf(date: string, weekStart: number): string {
  const offset = (weekday(date) - weekStart + 7) % 7;
  return new Date(Date.parse(`${date}T12:00:00Z`) - offset * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/** The dates of the grid's day columns, in order. */
function columns(page: Page) {
  return page.locator('.soleup-calendar [role="columnheader"] time');
}

/** An item's button, inside the grid cell of its local day. */
function item(page: Page, date: string, title: string) {
  return page
    .locator(`.soleup-calendar [role="gridcell"][data-date="${date}"]`)
    .getByRole("button", { name: title, exact: true });
}

async function openCalendar(page: Page, path: string) {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: "Calendar" }),
  ).toBeVisible();
  // The grid renders once the page hydrates.
  await expect(page.getByRole("grid")).toBeVisible();
}

/** Quick add, then a timed deadline from the Plan page's inline editor. */
async function addTaskDueAt(
  page: Page,
  title: string,
  dueDate: string,
  dueTime: string,
) {
  await page.goto("/plan");
  const quickAdd = page.getByRole("dialog", { name: "Add task" });
  await expect(async () => {
    if (!(await quickAdd.isVisible())) {
      await page.getByRole("button", { name: "Add task" }).click();
    }
    await expect(quickAdd).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await quickAdd.getByLabel("Title").fill(title);
  await quickAdd.getByLabel("Title").press("Enter");
  await expect(quickAdd).toHaveCount(0);

  const editor = page.getByRole("form", {
    name: `Dates and goal for ${title}`,
  });
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

/** An event through the New event dialog: timed, or all-day without a start time. */
async function addEvent(
  page: Page,
  title: string,
  date: string,
  start?: string,
) {
  const dialog = page.getByRole("dialog", { name: "New event" });
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: "New event" }).click();
    }
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await dialog.getByLabel("Title").fill(title);
  if (start === undefined) {
    await dialog.getByLabel("All day").check();
    await dialog.getByLabel("Start date").fill(date);
    await dialog.getByLabel("End date").fill(date);
  } else {
    await dialog.getByLabel("Start date").fill(date);
    await dialog.getByLabel("Start time").fill(start);
  }
  await dialog.getByRole("button", { name: "Add event" }).click();
  await expect(dialog).toHaveCount(0);
}

test("the week starts on the user's week start, and moves through the URL", async ({
  page,
}) => {
  test.slow();
  await signInAndConfirm(page);
  const today = tokyoDate();
  await openCalendar(page, "/plan/calendar?view=week");

  const views = page.getByRole("navigation", { name: "Calendar view" });
  await expect(views.getByRole("link")).toHaveText([
    "Agenda",
    "Week",
    "Day",
    "By area",
    "Timeline",
  ]);
  await expect(views.getByRole("link", { name: "Week" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  // Monday is the default week start.
  const monday = weekStartOf(today, 1);
  await expect(columns(page)).toHaveCount(7);
  await expect(columns(page).first()).toHaveAttribute("datetime", monday);
  await expect(
    page.getByText("Nothing this week.", { exact: false }),
  ).toBeVisible();
  await expectNoSeriousViolations(page);

  const move = page.getByRole("navigation", {
    name: "Move through the calendar",
  });
  await move.getByRole("link", { name: "Next week" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/plan/calendar\\?view=week&date=${tokyoDate(7)}$`),
  );
  await page.reload();
  await expect(columns(page).first()).toHaveAttribute(
    "datetime",
    weekStartOf(tokyoDate(7), 1),
  );
  await expect(move.getByRole("link", { name: "Today" })).not.toHaveAttribute(
    "aria-current",
  );
  // Back to today's week: today is left out of the URL.
  await move.getByRole("link", { name: "Previous week" }).click();
  await expect(page).toHaveURL(/\/plan\/calendar\?view=week$/);
  await expect(move.getByRole("link", { name: "Today" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await move.getByRole("link", { name: "Next week" }).click();
  await move.getByRole("link", { name: "Today" }).click();
  await expect(page).toHaveURL(/\/plan\/calendar\?view=week$/);

  // A column heading opens that day.
  await page.getByRole("link", { name: new RegExp(`^Today · `) }).click();
  await expect(page).toHaveURL(/\/plan\/calendar\?view=day$/);
  await expect(columns(page)).toHaveCount(1);
  await expect(page.getByRole("grid")).toBeVisible();
  await expect(views.getByRole("link", { name: "Day" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await move.getByRole("link", { name: "Previous day" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/plan/calendar\\?view=day&date=${tokyoDate(-1)}$`),
  );
  await expectNoSeriousViolations(page);

  // Sunday as the week start.
  await page.goto("/settings");
  await expect(async () => {
    await page.getByLabel("Week starts on").selectOption({ label: "Sunday" });
    await expect(page.getByLabel("Week starts on")).toHaveValue("0", {
      timeout: 1_000,
    });
  }).toPass();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved.");
  await openCalendar(page, "/plan/calendar?view=week");
  await expect(columns(page).first()).toHaveAttribute(
    "datetime",
    weekStartOf(today, 0),
  );
});

test("events by local time, the all-day row, deadline markers, side by side, and the keyboard", async ({
  page,
}) => {
  test.slow();
  await signInAndConfirm(page);
  const today = tokyoDate();
  // Another day in the same Monday-start week: tomorrow, or yesterday on
  // a Sunday.
  const otherOffset = weekday(today) === 0 ? -1 : 1;
  const other = tokyoDate(otherOffset);
  // 00:30 in Tokyo is still the day before in UTC.
  await addTaskDueAt(page, "Pay rent", today, "00:30");
  await openCalendar(page, "/plan/calendar?view=week");
  await addEvent(page, "Dentist", today, "09:00");
  await addEvent(page, "Standup", today, "09:30");
  await addEvent(page, "Conference", today);
  await addEvent(page, "Yoga", other, "09:10");

  // Each on its Tokyo day: the deadline marker at its time, the all-day
  // event in the all-day row.
  const rent = item(page, today, "Pay rent");
  await expect(rent).toHaveAttribute("data-all-day", "false");
  await expect(rent.locator("xpath=..")).toContainText("Due 12:30 AM");
  await expect(item(page, today, "Conference")).toHaveAttribute(
    "data-all-day",
    "true",
  );
  await expect(item(page, today, "Dentist").locator("xpath=..")).toContainText(
    "9:00 AM – 10:00 AM",
  );
  await expect(item(page, other, "Yoga")).toBeVisible();
  await expect(item(page, tokyoDate(-1), "Pay rent")).toHaveCount(0);
  // Timed items sit by their time: the 00:30 marker above 09:00.
  const rentBox = (await rent.locator("xpath=..").boundingBox())!;
  const dentistBox = (await item(page, today, "Dentist")
    .locator("xpath=..")
    .boundingBox())!;
  expect(rentBox.y).toBeLessThan(dentistBox.y);

  // Dentist (09:00â€“10:00) and Standup (09:30â€“10:30) overlap in time, so
  // they sit side by side: their blocks share rows but not columns.
  const standupBox = (await item(page, today, "Standup")
    .locator("xpath=..")
    .boundingBox())!;
  expect(standupBox.y).toBeLessThan(dentistBox.y + dentistBox.height);
  expect(standupBox.y).toBeGreaterThan(dentistBox.y);
  expect(
    standupBox.x >= dentistBox.x + dentistBox.width - 1 ||
      dentistBox.x >= standupBox.x + standupBox.width - 1,
  ).toBe(true);
  await expectNoSeriousViolations(page);

  // Keyboard only: Tab reaches the items; the arrow keys move through the
  // day in time order and across to the nearest item of the next day.
  await item(page, today, "Conference").focus();
  await page.keyboard.press("ArrowDown");
  await expect(rent).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(item(page, today, "Dentist")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(item(page, today, "Standup")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(item(page, today, "Standup")).toBeFocused();
  await page.keyboard.press(otherOffset === 1 ? "ArrowRight" : "ArrowLeft");
  await expect(item(page, other, "Yoga")).toBeFocused();
  await page.keyboard.press(otherOffset === 1 ? "ArrowLeft" : "ArrowRight");
  // Yoga at 09:10 is nearest to Dentist at 09:00.
  await expect(item(page, today, "Dentist")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(rent).toBeFocused();

  // Enter opens the item's dialog; Escape returns focus to it.
  await page.keyboard.press("Enter");
  const task = page.getByRole("dialog", { name: "Edit task" });
  await expect(task).toBeVisible();
  await expect(task.getByLabel("Title")).toHaveValue("Pay rent");
  await page.keyboard.press("Escape");
  await expect(task).toHaveCount(0);
  await expect(rent).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  const event = page.getByRole("dialog", { name: "Edit event" });
  await expect(event).toBeVisible();
  await expect(event.getByLabel("Title")).toHaveValue("Dentist");
  await expectNoSeriousViolations(page);
  await page.keyboard.press("Escape");
  await expect(event).toHaveCount(0);
  await expect(item(page, today, "Dentist")).toBeFocused();

  // Tab from the last navigation link goes through the day headings, then
  // the items, all-day row first.
  await page
    .getByRole("navigation", { name: "Move through the calendar" })
    .getByRole("link", { name: "Next week" })
    .focus();
  for (let i = 0; i < 8; i += 1) await page.keyboard.press("Tab");
  await expect(item(page, today, "Conference")).toBeFocused();

  // Day shows the same items for one day, side by side as well.
  await openCalendar(page, "/plan/calendar?view=day");
  await expect(item(page, today, "Dentist")).toBeVisible();
  await expect(item(page, today, "Conference")).toBeVisible();
  await expect(item(page, today, "Pay rent")).toBeVisible();
  await expect(page.getByRole("button", { name: "Yoga" })).toHaveCount(0);
  const dayDentist = (await item(page, today, "Dentist")
    .locator("xpath=..")
    .boundingBox())!;
  const dayStandup = (await item(page, today, "Standup")
    .locator("xpath=..")
    .boundingBox())!;
  expect(dayStandup.x).toBeGreaterThanOrEqual(
    dayDentist.x + dayDentist.width - 1,
  );
  await expectNoSeriousViolations(page);
});

test("a phone gets Day instead of Week, in the dark theme, without sideways scrolling", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: "dark" });
  await signInAndConfirm(page);
  const today = tokyoDate();
  await page.goto("/plan/calendar?view=week&date=" + tokyoDate(2));
  // Week becomes Day for the same day.
  await expect(page).toHaveURL(
    new RegExp(`/plan/calendar\\?view=day&date=${tokyoDate(2)}$`),
  );
  const views = page.getByRole("navigation", { name: "Calendar view" });
  await expect(views.getByRole("link")).toHaveText([
    "Agenda",
    "Day",
    "By area",
    "Timeline",
  ]);
  await page.goto("/plan/calendar?view=day");
  await expect(page.getByRole("grid")).toBeVisible();
  await addEvent(page, "Dentist", today, "09:00");
  await addEvent(page, "Standup", today, "09:30");
  await expect(item(page, today, "Standup")).toBeVisible();

  await page
    .getByRole("navigation", { name: "Move through the calendar" })
    .getByRole("link", { name: "Next day" })
    .click();
  await expect(page).toHaveURL(
    new RegExp(`/plan/calendar\\?view=day&date=${tokyoDate(1)}$`),
  );
  await expect(page.getByRole("button", { name: "Dentist" })).toHaveCount(0);
  await page.goBack();
  await expect(item(page, today, "Dentist")).toBeVisible();
  await expectNoSeriousViolations(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
