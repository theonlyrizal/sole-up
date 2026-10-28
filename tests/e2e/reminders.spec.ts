import { expect, test, type Locator, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// Reminder UI and preferences (chunk 5.6): the reminder fields in the task
// and event forms, the item dialog's reminder status, Settings' Reminders
// section, and the global switch stopping deliveries, checked through a
// real sweep. The browser (and so the confirmed time zone) is in Tokyo.
// No device is subscribed here: e2e browsers have no push service.

const TOKYO = "Asia/Tokyo";
test.use({ timezoneId: TOKYO });

// The e2e server's test-only sweep secret (playwright.config.ts).
const SWEEP_SECRET = "e2e-tests-only-sweep-secret-not-for-real-use";
const EARLY_HINT = "Reminders may arrive up to 15 minutes early.";

/** Tokyo's date ("YYYY-MM-DD") and time ("HH:MM") `minutes` from now. */
function tokyoInMinutes(minutes: number) {
  const at = new Date(Date.now() + minutes * 60_000);
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: TOKYO }).format(at);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: TOKYO,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  return { date, time };
}

/** Opens a dialog with its trigger, retrying until the page has hydrated. */
async function openWith(trigger: Locator, dialog: Locator) {
  await expect(async () => {
    if (!(await dialog.isVisible())) await trigger.click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
}

const toast = (page: Page, text: string) =>
  page.getByText(text, { exact: true });

/** The form's reminder select (the dialog's status section shares its name). */
const reminderField = (scope: Locator) =>
  scope.getByRole("combobox", { name: "Reminder" });

/** A task due `minutes` from now, added and given its deadline on Plan. */
async function addTaskDueSoon(page: Page, title: string, minutes: number) {
  await page.goto("/plan");
  const add = page.getByRole("dialog", { name: "Add task" });
  await openWith(page.getByRole("button", { name: "Add task" }), add);
  await add.getByLabel("Title").fill(title);
  await add.getByLabel("Title").press("Enter");
  await expect(add).toHaveCount(0);

  const due = tokyoInMinutes(minutes);
  await page.getByRole("button", { name: `Dates and goal: ${title}` }).click();
  const editor = page.getByRole("form", {
    name: `Dates and goal for ${title}`,
  });
  await editor.getByLabel("Due date").fill(due.date);
  await editor.getByLabel("Due time").fill(due.time);
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toHaveCount(0);
}

async function openTask(page: Page, title: string) {
  const dialog = page.getByRole("dialog", { name: "Edit task" });
  await openWith(page.getByRole("button", { name: `Edit: ${title}` }), dialog);
  return dialog;
}

async function openSettings(page: Page) {
  await page.goto("/settings");
  const form = page.getByRole("form", { name: "Reminder settings" });
  await expect(form).toBeVisible();
  return form;
}

test("turning reminders off in Settings stops their delivery", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await addTaskDueSoon(page, "Call the bank", 5);

  // The task form: a reminder from the list, saved from the keyboard.
  let dialog = await openTask(page, "Call the bank");
  const reminder = reminderField(dialog);
  await expect(reminder).toHaveValue("");
  await expect(reminder).toHaveAccessibleDescription(
    `Before the task's due time. ${EARLY_HINT}`,
  );
  await reminder.selectOption({ label: "At the time" });
  await dialog.getByLabel("Title").press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(toast(page, "Task saved")).toBeVisible();

  dialog = await openTask(page, "Call the bank");
  await expect(reminderField(dialog)).toHaveValue("0");
  await expect(dialog.getByRole("region", { name: "Reminder" })).toContainText(
    /Next reminder: .*\d:\d\d/,
  );
  await expectNoSeriousViolations(page);
  await page.keyboard.press("Escape");

  // Settings: with no device, a note says reminders can't arrive.
  const form = await openSettings(page);
  await expect(
    form.getByText(/No device is set up for notifications yet/),
  ).toBeVisible();
  const enabled = form.getByLabel("Send reminders");
  await expect(enabled).toBeChecked();
  await enabled.focus();
  await page.keyboard.press("Space");
  await expect(enabled).not.toBeChecked();
  await expect(enabled).toHaveAccessibleDescription(/^Off: nothing is sent/);
  await form.getByRole("button", { name: "Save reminders" }).click();
  await expect(form.getByRole("status")).toHaveText("Saved.");

  // A sweep (cron-job.org's call) finds the reminder due and sends nothing.
  const sweep = await page.request.post("/api/reminders/sweep", {
    headers: { authorization: `Bearer ${SWEEP_SECRET}` },
  });
  expect(sweep.status()).toBe(200);

  await page.goto("/plan");
  dialog = await openTask(page, "Call the bank");
  await expect(dialog.getByRole("region", { name: "Reminder" })).toContainText(
    "Skipped: reminders were off",
  );
  // Nothing went out, so there's nothing to snooze.
  await expect(dialog.getByRole("button", { name: /^Snooze/ })).toHaveCount(0);

  // The switch stays off after a reload.
  const reloaded = await openSettings(page);
  await expect(reloaded.getByLabel("Send reminders")).not.toBeChecked();
});

test("new events remind 10 minutes before; a series' reminder applies to every event", async ({
  page,
}) => {
  test.slow();
  await signInAndConfirm(page);
  await page.goto("/plan/calendar");
  const create = page.getByRole("dialog", { name: "New event" });
  await openWith(page.getByRole("button", { name: "New event" }), create);

  const reminder = reminderField(create);
  await expect(reminder).toHaveValue("10");
  await expect(reminder).toHaveAccessibleDescription(EARLY_HINT);
  // All-day events never remind, so the field goes away.
  await create.getByLabel("All day").check();
  await expect(reminderField(create)).toHaveCount(0);
  await create.getByLabel("All day").uncheck();
  await expect(reminder).toHaveValue("10");

  const tomorrow = tokyoInMinutes(24 * 60).date;
  await create.getByLabel("Title").fill("Standup");
  await create.getByLabel("Start date").fill(tomorrow);
  await create.getByLabel("Start time").fill("09:00");
  await create.getByLabel("Repeat", { exact: true }).selectOption("weekly");
  await expect(reminder).toHaveAccessibleDescription(
    `Applies to every event in the series. ${EARLY_HINT}`,
  );
  await create.getByRole("button", { name: "Add event" }).click();
  await expect(create).toHaveCount(0);

  const edit = page.getByRole("dialog", { name: "Edit event" });
  const standup = page
    .getByRole("listitem")
    .filter({ has: page.locator(`h2 time[datetime="${tomorrow}"]`) })
    .getByRole("button", { name: "Standup", exact: true });
  await openWith(standup, edit);
  await expect(reminderField(edit)).toHaveValue("10");
  await expect(edit.getByRole("region", { name: "Reminder" })).toContainText(
    /Next reminder: tomorrow 8:50\sAM/,
  );

  // A new reminder can't be "this event" only.
  await reminderField(edit).selectOption({ label: "1 hour before" });
  await edit.getByRole("button", { name: "Save" }).click();
  const thisEvent = edit.getByRole("radio", {
    name: "This event",
    exact: true,
  });
  await expect(thisEvent).toBeDisabled();
  await expect(thisEvent).toHaveAccessibleDescription(
    "A reminder applies to every event in the series.",
  );
  await edit.getByRole("radio", { name: "All events" }).check();
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toHaveCount(0);
  await expect(toast(page, "Event saved")).toBeVisible();

  await openWith(standup, edit);
  await expect(reminderField(edit)).toHaveValue("60");
  await expect(edit.getByRole("region", { name: "Reminder" })).toContainText(
    /Next reminder: tomorrow 8:00\sAM/,
  );
});

test("quiet hours and the daily nudge, with field errors and a warning", async ({
  page,
}) => {
  await signInAndConfirm(page);
  const form = await openSettings(page);

  // Off by default; turning them on suggests 22:00–07:00.
  const quiet = form.getByLabel("Quiet hours");
  await expect(quiet).not.toBeChecked();
  await expect(form.getByLabel("From")).toHaveCount(0);
  await quiet.check();
  await expect(form.getByLabel("From")).toHaveValue("22:00");
  await expect(form.getByLabel("Until")).toHaveValue("07:00");

  // Equal times are refused next to the field, which gets focus.
  await form.getByLabel("Until").fill("22:00");
  await form.getByRole("button", { name: "Save reminders" }).click();
  const until = form.getByLabel("Until");
  await expect(until).toHaveAttribute("aria-invalid", "true");
  await expect(until).toHaveAccessibleDescription(
    "Quiet hours need to end at a different time than they start.",
  );
  await expect(until).toBeFocused();
  await until.fill("07:00");

  // A nudge inside quiet hours waits for their end, and says so.
  const nudge = form.getByLabel("Daily planning nudge");
  await expect(nudge).toHaveValue("");
  await nudge.fill("06:30");
  await expect(
    form.getByText(
      "This time is inside your quiet hours, so the nudge will wait until they end at 07:00.",
    ),
  ).toBeVisible();
  await nudge.fill("07:30");
  await expect(form.getByText(/inside your quiet hours/)).toHaveCount(0);

  await form.getByLabel("Private mode").check();
  await expectNoSeriousViolations(page);
  await form.getByRole("button", { name: "Save reminders" }).click();
  await expect(form.getByRole("status")).toHaveText("Saved.");

  const reloaded = await openSettings(page);
  await expect(reloaded.getByLabel("Quiet hours")).toBeChecked();
  await expect(reloaded.getByLabel("From")).toHaveValue("22:00");
  await expect(reloaded.getByLabel("Until")).toHaveValue("07:00");
  await expect(reloaded.getByLabel("Daily planning nudge")).toHaveValue(
    "07:30",
  );
  await expect(reloaded.getByLabel("Private mode")).toBeChecked();

  // Turning the nudge off from its button.
  await reloaded.getByRole("button", { name: "Turn off the nudge" }).click();
  await expect(reloaded.getByLabel("Daily planning nudge")).toHaveValue("");
  await reloaded.getByRole("button", { name: "Save reminders" }).click();
  await expect(reloaded.getByRole("status")).toHaveText("Saved.");
});
