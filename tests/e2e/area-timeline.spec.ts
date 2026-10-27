import { expect, type Locator, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// The Timeline view (chunk 4.11): a row per active life area plus "No
// area" across a week (the default) or a day on a horizontal time axis,
// items placed at their Tokyo time in their area's row, overlapping items
// stacked in lanes, keyboard movement along and across rows, the span and
// day in the URL, and sideways scrolling inside the view (not the page),
// with the row headings kept in view, on a phone. The browser (and so the
// confirmed time zone) is in Tokyo, where early morning is the day before
// in UTC.

const TOKYO = "Asia/Tokyo";
test.use({ timezoneId: TOKYO });

const DAY_MS = 24 * 60 * 60 * 1000;

/** How wide an hour is: 4rem on a day, 1rem on a week (16 px root). */
const DAY_HOUR_PX = 64;
const WEEK_HOUR_PX = 16;

/** The user's date `days` from today in Tokyo (no DST there). */
function tokyoDate(days = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TOKYO }).format(
    new Date(Date.now() + days * DAY_MS),
  );
}

/** `date` moved by `days`. */
function addDays(date: string, days: number): string {
  const next = new Date(`${date}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

/**
 * Next week's Monday (the default week start), so the test never depends
 * on which weekday it runs.
 */
function nextMonday(): string {
  const today = tokyoDate();
  const sinceMonday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(today, 7 - sinceMonday);
}

/**
 * Declines the starter areas and adds `names` in order, each once the
 * last is saved and listed (Enter does nothing while a save is pending).
 */
async function addAreas(page: Page, names: string[]) {
  await page.goto("/goals/areas");
  await expect(
    page.getByRole("heading", { level: 1, name: "Life areas" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "No thanks" }).click();
  await expect(page.getByText("No life areas yet")).toBeVisible();
  const newArea = page.getByLabel("New area");
  const active = page
    .getByRole("region", { name: "Active" })
    .getByRole("listitem")
    .locator("span.font-medium");
  for (const [index, name] of names.entries()) {
    await expect(newArea).toBeEnabled();
    await newArea.fill(name);
    await newArea.press("Enter");
    await expect(active).toHaveText(names.slice(0, index + 1));
  }
}

/** An event from Day's New event dialog on `date`, timed or all-day. */
async function addEvent(
  page: Page,
  title: string,
  { date, start, area }: { date: string; start?: string; area?: string },
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
  if (area !== undefined) {
    await dialog.getByLabel("Life area").selectOption({ label: area });
  }
  await dialog.getByRole("button", { name: "Add event" }).click();
  await expect(dialog).toHaveCount(0);
}

/** The view's scrolling region. */
function view(page: Page) {
  return page.getByRole("region", { name: /^Timeline by area, / });
}

/** An area's row. */
function row(page: Page, name: string) {
  return view(page).getByRole("group", { name, exact: true });
}

/** An item's button in an area's row. */
function item(page: Page, area: string, title: string) {
  return row(page, area).getByRole("button", { name: title, exact: true });
}

/** The box drawn around an item's button. */
async function boxOf(button: Locator) {
  return (await button.locator("xpath=..").boundingBox())!;
}

/** How far an item's box starts from its row's time axis, in px. */
async function leftInTrack(page: Page, area: string, title: string) {
  const track = (await row(page, area).locator("[data-track]").boundingBox())!;
  return (await boxOf(item(page, area, title))).x - track.x;
}

async function openTimeline(page: Page, path: string) {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: "Calendar" }),
  ).toBeVisible();
  // The view renders once the page hydrates.
  await expect(view(page)).toBeVisible();
}

test("a row per area, items at their Tokyo time, lanes, the keyboard, and the span in the URL", async ({
  page,
}) => {
  test.slow();
  const monday = nextMonday();
  const tuesday = addDays(monday, 1);
  const thursday = addDays(monday, 3);
  await signInAndConfirm(page);
  await addAreas(page, ["Health", "Work"]);
  await page.goto("/plan/calendar?view=day");
  await expect(page.getByRole("grid")).toBeVisible();
  // 08:00 in Tokyo is still the day before in UTC.
  await addEvent(page, "Dentist", {
    date: tuesday,
    start: "08:00",
    area: "Health",
  });
  await addEvent(page, "Physio", {
    date: tuesday,
    start: "08:30",
    area: "Health",
  });
  await addEvent(page, "Standup", {
    date: tuesday,
    start: "08:00",
    area: "Work",
  });
  await addEvent(page, "Conference", { date: tuesday });
  await addEvent(page, "Errands", { date: thursday, start: "13:00" });

  // A week by default, from Monday.
  await openTimeline(page, `/plan/calendar?view=timeline&date=${tuesday}`);
  const views = page.getByRole("navigation", { name: "Calendar view" });
  await expect(views.getByRole("link", { name: "Timeline" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  const spans = page.getByRole("navigation", { name: "Timeline span" });
  await expect(spans.getByRole("link", { name: "Week" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(view(page).getByRole("heading", { level: 2 })).toHaveText([
    "Health",
    "Work",
    "No area",
  ]);
  await expect(item(page, "Work", "Dentist")).toHaveCount(0);

  // Positions on the week: Tuesday 08:00 is 32 hours in, Thursday 13:00
  // 85, and the all-day Conference covers Tuesday from local midnight.
  expect(
    Math.abs(
      (await leftInTrack(page, "Health", "Dentist")) - 32 * WEEK_HOUR_PX,
    ),
  ).toBeLessThan(3);
  expect(
    Math.abs(
      (await leftInTrack(page, "No area", "Errands")) - 85 * WEEK_HOUR_PX,
    ),
  ).toBeLessThan(3);
  expect(
    Math.abs(
      (await leftInTrack(page, "No area", "Conference")) - 24 * WEEK_HOUR_PX,
    ),
  ).toBeLessThan(3);
  expect(
    Math.abs(
      (await boxOf(item(page, "No area", "Conference"))).width -
        24 * WEEK_HOUR_PX,
    ),
  ).toBeLessThan(3);
  // Dentist and Physio overlap in Health, so they stack in two lanes.
  const dentist = await boxOf(item(page, "Health", "Dentist"));
  const physio = await boxOf(item(page, "Health", "Physio"));
  expect(physio.y).toBeGreaterThanOrEqual(dentist.y + dentist.height - 1);
  expect(physio.x).toBeLessThan(dentist.x + dentist.width);
  // Standup is in Work's row, below Health's, at Dentist's time.
  const standup = await boxOf(item(page, "Work", "Standup"));
  expect(standup.y).toBeGreaterThan(physio.y + physio.height);
  expect(Math.abs(standup.x - dentist.x)).toBeLessThan(2);
  await expect(item(page, "Health", "Dentist")).toHaveAccessibleDescription(
    /^Event, .*8:00 AM – 9:00 AM, Health$/,
  );
  await expectNoSeriousViolations(page);

  // Keyboard only: the view is a Tab stop (it scrolls sideways), then its
  // items; arrows move along a row and across to the nearest item.
  await view(page).focus();
  await page.keyboard.press("Tab");
  await expect(item(page, "Health", "Dentist")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(item(page, "Health", "Physio")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(item(page, "Health", "Physio")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect(item(page, "Health", "Dentist")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(item(page, "Work", "Standup")).toBeFocused();
  // The nearest in time: Tuesday's Conference, not Thursday's Errands.
  await page.keyboard.press("ArrowDown");
  await expect(item(page, "No area", "Conference")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(item(page, "No area", "Errands")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(item(page, "Work", "Standup")).toBeFocused();
  await page.keyboard.press("Home");
  await expect(item(page, "Health", "Dentist")).toBeFocused();
  await page.keyboard.press("End");
  await expect(item(page, "No area", "Errands")).toBeFocused();

  // Enter opens the item's dialog; Escape returns focus to it.
  await page.keyboard.press("Home");
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Edit event" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Title")).toHaveValue("Dentist");
  await expectNoSeriousViolations(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(item(page, "Health", "Dentist")).toBeFocused();

  // One day, in the URL: 08:00 is 8 hours in at 64 px an hour.
  await spans.getByRole("link", { name: "Day" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/plan/calendar\\?view=timeline&span=day&date=${tuesday}$`),
  );
  await expect(item(page, "No area", "Errands")).toHaveCount(0);
  expect(
    Math.abs((await leftInTrack(page, "Health", "Dentist")) - 8 * DAY_HOUR_PX),
  ).toBeLessThan(3);
  expect(
    Math.abs((await leftInTrack(page, "Health", "Physio")) - 8.5 * DAY_HOUR_PX),
  ).toBeLessThan(3);
  await expect(
    item(page, "Health", "Dentist").locator("xpath=.."),
  ).toContainText("8:00 AM – 9:00 AM");
  await expectNoSeriousViolations(page);

  const move = page.getByRole("navigation", {
    name: "Move through the calendar",
  });
  await move.getByRole("link", { name: "Next day" }).click();
  await expect(page).toHaveURL(
    new RegExp(
      `/plan/calendar\\?view=timeline&span=day&date=${addDays(tuesday, 1)}$`,
    ),
  );
  await expect(
    page.getByText("Nothing this day.", { exact: false }),
  ).toBeVisible();
  await expect(view(page).getByRole("button")).toHaveCount(0);
  await page.reload();
  await expect(view(page).getByRole("heading", { level: 2 })).toHaveText([
    "Health",
    "Work",
    "No area",
  ]);
  await move.getByRole("link", { name: "Previous day" }).click();
  await expect(item(page, "Health", "Dentist")).toBeVisible();

  // Switching views keeps the day: By area shows it, and back on the
  // Timeline it is a day.
  await views.getByRole("link", { name: "By area" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/plan/calendar\\?view=areas&date=${tuesday}$`),
  );
  await views.getByRole("link", { name: "Timeline" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/plan/calendar\\?view=timeline&span=day&date=${tuesday}$`),
  );
  // Today's week is the plain URL.
  await spans.getByRole("link", { name: "Week" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/plan/calendar\\?view=timeline&date=${tuesday}$`),
  );
  await move.getByRole("link", { name: "Today" }).click();
  await expect(page).toHaveURL(/\/plan\/calendar\?view=timeline$/);
});

test("without areas everything is under No area, and a phone scrolls the axis with the headings in view", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: "dark" });
  await signInAndConfirm(page);
  await page.goto("/plan/calendar?view=day");
  await expect(page.getByRole("grid")).toBeVisible();
  await addEvent(page, "Dentist", { date: tokyoDate(), start: "09:00" });

  await openTimeline(page, "/plan/calendar?view=timeline");
  await expect(view(page).getByRole("heading", { level: 2 })).toHaveText([
    "No area",
  ]);
  await expect(item(page, "No area", "Dentist")).toBeAttached();
  await expect(
    page.getByText("You have no active life areas yet", { exact: false }),
  ).toBeVisible();
  await expectNoSeriousViolations(page);

  // A week is wider than a phone: the view scrolls, the page doesn't.
  expect(
    await view(page).evaluate(
      (region) => region.scrollWidth > region.clientWidth,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
  // The keyboard scrolls the view sideways, and the heading stays in view.
  await view(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => view(page).evaluate((region) => region.scrollLeft))
    .toBeGreaterThan(0);
  const region = (await view(page).boundingBox())!;
  const heading = (await row(page, "No area")
    .getByRole("heading")
    .boundingBox())!;
  expect(Math.abs(heading.x - region.x)).toBeLessThan(3);
  // Tab reaches the item, which scrolls into view beside the heading.
  await page.keyboard.press("Tab");
  await expect(item(page, "No area", "Dentist")).toBeFocused();
  const dentist = await boxOf(item(page, "No area", "Dentist"));
  expect(dentist.x).toBeGreaterThanOrEqual(heading.x + heading.width - 1);
  expect(dentist.x + dentist.width).toBeLessThanOrEqual(
    region.x + region.width + 1,
  );
  await expectNoSeriousViolations(page);
});
