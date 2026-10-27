import { expect, type Locator, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// Today's timeline and Home's next commitment (chunk 4.9): a timed event
// and a time block on today's Tokyo date show at the top of Today in time
// order, and Home's card and the timeline link to the item, whose dialog
// opens on the calendar's Day view. The browser (and so the confirmed time
// zone) is in Tokyo.

const TOKYO = "Asia/Tokyo";
test.use({ timezoneId: TOKYO });

/** The user's date today in Tokyo (no DST there). */
function tokyoToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TOKYO }).format(
    new Date(),
  );
}

/** Opens a dialog from its button, retrying until the page has hydrated. */
async function openDialog(page: Page, button: Locator, name: string) {
  const dialog = page.getByRole("dialog", { name });
  await expect(async () => {
    if (!(await dialog.isVisible())) await button.click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return dialog;
}

/** Quick add on the Plan page. */
async function addTask(page: Page, title: string) {
  await page.goto("/plan");
  const quickAdd = await openDialog(
    page,
    page.getByRole("button", { name: "Add task" }),
    "Add task",
  );
  await quickAdd.getByLabel("Title").fill(title);
  await quickAdd.getByLabel("Title").press("Enter");
  await expect(quickAdd).toHaveCount(0);
}

function card(page: Page, name: string) {
  return page.getByRole("region", { name, exact: true });
}

test("today's event and block show on Today and Home, and link to the calendar", async ({
  page,
}) => {
  test.slow();
  await signInAndConfirm(page);
  const today = tokyoToday();

  // Nothing on the calendar yet.
  await page.goto("/home");
  await expect(card(page, "Next commitment")).toContainText("Nothing yet");
  await page.goto("/plan/today");
  const schedule = card(page, "Schedule");
  await expect(schedule).toContainText("No events or time blocks today.");

  // A block from midnight to 01:00 today, by form.
  await addTask(page, "Write report");
  const form = await openDialog(
    page,
    page.getByRole("button", { name: "Block time: Write report" }),
    "Block time",
  );
  await form.getByLabel("Date").fill(today);
  await form.getByLabel("Start time").fill("00:00");
  await form.getByLabel("Length (minutes)").fill("60");
  await form.getByRole("button", { name: "Block time" }).click();
  await expect(form).toHaveCount(0);

  // An event running all of today, from 00:00 (still yesterday in UTC).
  await page.goto("/plan/calendar");
  const event = await openDialog(
    page,
    page.getByRole("button", { name: "New event" }),
    "New event",
  );
  await event.getByLabel("Title").fill("Conference");
  await event.getByLabel("Start date").fill(today);
  await event.getByLabel("Start time").fill("00:00");
  await event.getByLabel("End date").fill(today);
  await event.getByLabel("End time").fill("23:59");
  await event.getByRole("button", { name: "Add event" }).click();
  await expect(event).toHaveCount(0);

  // Today: the timeline is the first section, in time order (the event
  // first on the shared start), each with what it is and its times.
  await page.goto("/plan/today");
  await expect(page.getByRole("heading", { level: 2 }).first()).toHaveText(
    "Schedule",
  );
  const rows = schedule.getByRole("listitem");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Conference");
  await expect(rows.nth(0)).toContainText("Event");
  await expect(rows.nth(0)).toContainText("12:00 AM – 11:59 PM");
  await expect(rows.nth(1)).toContainText("Write report");
  await expect(rows.nth(1)).toContainText(
    /Time block · (Scheduled|Not marked)/,
  );
  await expect(rows.nth(1)).toContainText("12:00 AM – 1:00 AM");
  await expectNoSeriousViolations(page);

  // The block's link opens it on the Day view.
  await schedule.getByRole("link", { name: "Write report" }).click();
  await expect(page).toHaveURL(/view=day/);
  const blockDialog = page.getByRole("dialog", { name: "Time block" });
  await expect(blockDialog).toBeVisible();
  await expect(blockDialog).toContainText("Write report");

  // Home: the event is the next commitment, already under way.
  await page.goto("/home");
  const next = card(page, "Next commitment");
  await expect(next).toContainText("Event");
  await expect(next).toContainText("Now, until 11:59 PM");
  await expect(next).toContainText(/Range:.+ to .+/);
  await expectNoSeriousViolations(page);
  const link = next.getByRole("link", { name: "Conference" });
  await expect(link).toHaveAttribute("href", /view=day&item=event%3A/);

  // The link opens the event's dialog on today's Day view, then drops
  // `item` from the URL so a refresh doesn't open it again.
  await link.click();
  const dialog = page.getByRole("dialog", { name: "Edit event" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Title")).toHaveValue("Conference");
  await expect(page).toHaveURL(/\/plan\/calendar\?view=day$/);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(
    page
      .locator(`.soleup-calendar [role="gridcell"][data-date="${today}"]`)
      .getByRole("button", { name: "Conference", exact: true }),
  ).toBeFocused();
  await page.reload();
  await expect(page.getByRole("grid")).toBeVisible();
  await expect(dialog).toHaveCount(0);
});
