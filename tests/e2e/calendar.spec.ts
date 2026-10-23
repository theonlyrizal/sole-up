import { expect, test, type Locator, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// The event dialog (chunk 4.4): default length, the repeat builder with its
// field errors, all-day events with an inclusive end, goal → life area, the
// time-zone note, and the scope prompt for occurrences of a series, driven
// from the keyboard where it matters. Events are opened from their Agenda
// item (4.5), and deleted from their dialog. The browser (and so the
// confirmed time zone) is in Tokyo.

const TOKYO = "Asia/Tokyo";
test.use({ timezoneId: TOKYO });

/** The user's date `days` from today in Tokyo (no DST there). */
function tokyoDate(days = 0): string {
  const at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TOKYO }).format(at);
}

/** "Mon" … "Sun" for a Tokyo date, as the repeat summary words it. */
function shortWeekday(days: number): string {
  const at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    timeZone: TOKYO,
  }).format(at);
}

function longWeekday(days: number): string {
  const at = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: TOKYO,
  }).format(at);
}

/** One day of the Agenda (4.5), found by its heading's `<time>`. */
function day(page: Page, date: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.locator(`h2 time[datetime="${date}"]`) });
}

/** An event's button on a day: it opens the event's dialog. */
function item(page: Page, date: string, title: string) {
  return day(page, date).getByRole("button", { name: title, exact: true });
}

/** The row of an event on a day. */
function row(page: Page, date: string, title: string) {
  return day(page, date)
    .getByRole("listitem")
    .filter({ has: page.getByRole("button", { name: title, exact: true }) });
}

async function openCalendar(page: Page) {
  await page.goto("/plan/calendar");
  await expect(
    page.getByRole("heading", { level: 1, name: "Calendar" }),
  ).toBeVisible();
}

/** Opens a dialog with its trigger, retrying until the page has hydrated. */
async function openWith(trigger: Locator, dialog: Locator) {
  await expect(async () => {
    if (!(await dialog.isVisible())) await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

async function newEventDialog(page: Page) {
  const dialog = page.getByRole("dialog", { name: "New event" });
  await openWith(page.getByRole("button", { name: "New event" }), dialog);
  return dialog;
}

async function editDialog(page: Page, date: string, title: string) {
  const dialog = page.getByRole("dialog", { name: "Edit event" });
  await openWith(item(page, date, title), dialog);
  return dialog;
}

/** A toast's text (toasts also render in a live region, so match exactly). */
const toast = (page: Page, text: string) =>
  page.getByText(text, { exact: true });

/** A weekly event at 09:00 starting tomorrow, through the dialog. */
async function addWeekly(page: Page, title: string) {
  const dialog = await newEventDialog(page);
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Start date").fill(tokyoDate(1));
  await dialog.getByLabel("Start time").fill("09:00");
  await dialog.getByLabel("Repeat", { exact: true }).selectOption("weekly");
  await dialog.getByRole("button", { name: "Add event" }).click();
  await expect(dialog).toHaveCount(0);
}

test("a repeating event from the keyboard, with field errors in the builder", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await openCalendar(page);
  await expect(
    page.getByRole("navigation", { name: "Plan" }).getByRole("link", {
      name: "Calendar",
    }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    page.getByRole("heading", { name: "Nothing in these days" }),
  ).toBeVisible();

  // Open with Enter; the title has focus.
  const dialog = page.getByRole("dialog", { name: "New event" });
  const newEvent = page.getByRole("button", { name: "New event" });
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await newEvent.focus();
      await page.keyboard.press("Enter");
    }
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  const title = dialog.getByLabel("Title");
  await expect(title).toBeFocused();
  await page.keyboard.type("Physio");

  // A new event lasts an hour, and moving the start keeps that length.
  const startTime = dialog.getByLabel("Start time");
  const endTime = dialog.getByLabel("End time");
  const [start, end] = [
    await startTime.inputValue(),
    await endTime.inputValue(),
  ];
  const minutes = (time: string) =>
    Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  expect((minutes(end) - minutes(start) + 1440) % 1440).toBe(60);
  await dialog.getByLabel("Start date").fill(tokyoDate(1));
  await startTime.fill("09:00");
  await expect(endTime).toHaveValue("10:00");
  await expect(
    dialog.getByText(`Times are in your time zone, ${TOKYO}.`),
  ).toBeVisible();

  // Weekly starts on the start's weekday. Break the builder on purpose.
  await dialog.getByLabel("Repeat", { exact: true }).selectOption("weekly");
  const weekday = dialog.getByRole("checkbox", { name: longWeekday(1) });
  await expect(weekday).toBeChecked();
  await weekday.focus();
  await page.keyboard.press("Space");
  await expect(weekday).not.toBeChecked();
  const interval = dialog.getByLabel("Repeat every (weeks)");
  await interval.fill("0");
  await title.press("Enter");

  // Errors sit on their fields, and focus moves to the first one.
  await expect(interval).toHaveAccessibleDescription(
    "Repeat at least every 1.",
  );
  await expect(interval).toBeFocused();
  await expect(
    dialog.getByRole("group", { name: "On these days" }),
  ).toHaveAccessibleDescription("Choose at least one day.");
  await expectNoSeriousViolations(page);

  await interval.fill("1");
  await weekday.focus();
  await page.keyboard.press("Space");
  // Arrow keys move between the "Ends" choices.
  await dialog.getByRole("radio", { name: "Never" }).focus();
  await page.keyboard.press("ArrowDown");
  await expect(
    dialog.getByRole("radio", { name: "After a number of times" }),
  ).toBeChecked();
  await dialog.getByRole("spinbutton", { name: "Number of times" }).fill("3");
  await expect(
    dialog.getByText(`Every week on ${shortWeekday(1)}, 3 times`),
  ).toBeVisible();

  await title.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(toast(page, "Event added")).toBeVisible();
  for (const days of [1, 8, 15]) {
    await expect(row(page, tokyoDate(days), "Physio")).toContainText(
      `Every week on ${shortWeekday(1)}, 3 times`,
    );
  }
  await expect(row(page, tokyoDate(22), "Physio")).toHaveCount(0);

  // Escape closes the dialog and returns focus to the item.
  const edit = item(page, tokyoDate(1), "Physio");
  await editDialog(page, tokyoDate(1), "Physio");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(edit).toBeFocused();
});

test("all-day with an inclusive end, goal → area, and another time zone", async ({
  page,
}) => {
  test.slow();
  await signInAndConfirm(page);

  // A goal in a life area.
  await page.goto("/goals/areas");
  await page.getByRole("button", { name: "No thanks" }).click();
  await page.getByLabel("New area").fill("Health");
  await page.getByLabel("New area").press("Enter");
  await expect(
    page.getByRole("region", { name: "Active" }).getByText("Health", {
      exact: true,
    }),
  ).toBeVisible();
  await page.goto("/goals");
  const goalDialog = page.getByRole("dialog", { name: "New goal" });
  await openWith(
    page.getByRole("button", { name: "New goal" }).first(),
    goalDialog,
  );
  await goalDialog.getByLabel("Title").fill("Run a half marathon");
  await goalDialog.getByLabel("Life area").selectOption({ label: "Health" });
  await goalDialog.getByRole("button", { name: "Add goal" }).click();
  await expect(goalDialog).toHaveCount(0);

  await openCalendar(page);
  const dialog = await newEventDialog(page);
  await dialog.getByLabel("Title").fill("Race weekend");
  await dialog.getByRole("checkbox", { name: "All day" }).check();
  await expect(dialog.getByLabel("Start time")).toHaveCount(0);
  await dialog.getByLabel("Start date").fill(tokyoDate(3));
  await expect(dialog.getByLabel("End date")).toHaveValue(tokyoDate(3));
  await dialog.getByLabel("End date").fill(tokyoDate(4));
  await dialog
    .getByLabel("Goal")
    .selectOption({ label: "Run a half marathon" });
  await expect(dialog.getByLabel("Life area")).toHaveValue(/.+/);
  await expect(
    dialog.getByLabel("Life area").locator("option:checked"),
  ).toHaveText("Health");
  await dialog.getByRole("button", { name: "Add event" }).click();
  await expect(dialog).toHaveCount(0);

  await page.reload();
  const race = row(page, tokyoDate(3), "Race weekend");
  await expect(race).toContainText("All day");
  await expect(race).toContainText("Goal: Run a half marathon");
  await expect(race).toContainText("Area: Health");
  // The Agenda lists it on each of its days, and not after.
  await expect(row(page, tokyoDate(4), "Race weekend")).toContainText(
    "All day",
  );
  await expect(day(page, tokyoDate(5))).toHaveCount(0);

  // The end date reads inclusive when edited. Make it a timed event in New
  // York: the dialog shows its times in the user's zone too.
  const edit = await editDialog(page, tokyoDate(3), "Race weekend");
  await expect(edit.getByLabel("End date")).toHaveValue(tokyoDate(4));
  await edit.getByRole("checkbox", { name: "All day" }).uncheck();
  await edit.getByLabel("Start time").fill("09:00");
  await expect(edit.getByLabel("End time")).toHaveValue("10:00");
  await edit.getByLabel("End date").fill(tokyoDate(3));
  await edit.getByRole("button", { name: "Change time zone" }).click();
  await edit.getByLabel("Time zone").selectOption("America/New_York");
  await expect(edit.getByLabel("Time zone")).toHaveAccessibleDescription(
    /^In your time zone \(Asia\/Tokyo\): /,
  );
  await expectNoSeriousViolations(page);
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toHaveCount(0);
  await expect(toast(page, "Event saved")).toBeVisible();
  // 09:00 in New York is late evening or the next morning in Tokyo.
  await expect(
    page
      .getByRole("listitem")
      .filter({
        has: page.getByRole("button", { name: "Race weekend", exact: true }),
      })
      .filter({ hasNot: page.locator("h2") })
      .filter({ hasText: "America/New_York" }),
  ).toBeVisible();
});

test("occurrences ask which events to change or delete, naming what's dropped", async ({
  page,
}) => {
  test.slow();
  await signInAndConfirm(page);
  await openCalendar(page);
  await addWeekly(page, "Standup");
  await expect(row(page, tokyoDate(8), "Standup")).toBeVisible();

  // Move only the second one.
  let dialog = await editDialog(page, tokyoDate(8), "Standup");
  await dialog.getByLabel("Start time").fill("11:00");
  await dialog.getByRole("button", { name: "Save" }).click();
  const thisEvent = dialog.getByRole("radio", {
    name: "This event",
    exact: true,
  });
  await expect(thisEvent).toBeChecked();
  await expect(thisEvent).toBeFocused();
  await expectNoSeriousViolations(page);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row(page, tokyoDate(8), "Standup")).toContainText("11:00");
  await expect(row(page, tokyoDate(8), "Standup")).toContainText(
    "(this one changed)",
  );

  // Every other week from the first one: "this event" can't take a new
  // repeat, and "all events" names the moved one it would drop.
  dialog = await editDialog(page, tokyoDate(1), "Standup");
  await dialog.getByLabel("Repeat every (weeks)").fill("2");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(thisEvent).toBeDisabled();
  await expect(thisEvent).toHaveAccessibleDescription(
    "A new repeat applies to more than one event.",
  );
  const following = dialog.getByRole("radio", {
    name: "This and following events",
  });
  await expect(following).toBeChecked();
  const all = dialog.getByRole("radio", { name: "All events" });
  await expect(all).toHaveAccessibleDescription(
    /1 event you changed separately won't keep those changes: .*\(edited\)/,
  );
  await page.keyboard.press("ArrowDown");
  await expect(all).toBeChecked();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(row(page, tokyoDate(8), "Standup")).toHaveCount(0);
  await expect(row(page, tokyoDate(15), "Standup")).toBeVisible();
  await expect(row(page, tokyoDate(29), "Standup")).toBeVisible();

  // Delete from the 15th on, from the event's dialog.
  dialog = await editDialog(page, tokyoDate(15), "Standup");
  const remove = page.getByRole("alertdialog", { name: "Delete “Standup”?" });
  await openWith(
    dialog.getByRole("button", { name: "Delete: Standup" }),
    remove,
  );
  await expect(
    remove.getByRole("radio", { name: "This event", exact: true }),
  ).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    remove.getByRole("radio", { name: "This and following events" }),
  ).toBeChecked();
  await expectNoSeriousViolations(page);
  await remove.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(remove).toHaveCount(0);
  await expect(dialog).toHaveCount(0);
  await expect(toast(page, "Events deleted")).toBeVisible();
  await expect(row(page, tokyoDate(15), "Standup")).toHaveCount(0);
  await expect(row(page, tokyoDate(29), "Standup")).toHaveCount(0);
  await expect(row(page, tokyoDate(1), "Standup")).toBeVisible();
});
