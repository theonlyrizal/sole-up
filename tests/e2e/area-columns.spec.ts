import { expect, type Locator, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// The By area view (chunk 4.10): one day with a column per active life
// area plus "No area", events in their area's column, overlapping items
// side by side within a column, keyboard movement within and across
// columns, the day in the URL, and sideways scrolling inside the view (not
// the page) on a phone. The browser (and so the confirmed time zone) is in
// Tokyo, where early morning is the day before in UTC.

const TOKYO = "Asia/Tokyo";
test.use({ timezoneId: TOKYO });

const DAY_MS = 24 * 60 * 60 * 1000;

/** The user's date `days` from today in Tokyo (no DST there). */
function tokyoDate(days = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TOKYO }).format(
    new Date(Date.now() + days * DAY_MS),
  );
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

/** An event from Day's New event dialog, timed or all-day, in an area. */
async function addEvent(
  page: Page,
  title: string,
  { start, area }: { start?: string; area?: string } = {},
) {
  const dialog = page.getByRole("dialog", { name: "New event" });
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: "New event" }).click();
    }
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await dialog.getByLabel("Title").fill(title);
  const today = tokyoDate();
  if (start === undefined) {
    await dialog.getByLabel("All day").check();
    await dialog.getByLabel("Start date").fill(today);
    await dialog.getByLabel("End date").fill(today);
  } else {
    await dialog.getByLabel("Start date").fill(today);
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
  return page.getByRole("region", { name: /^By area, / });
}

/** An area's column. */
function column(page: Page, name: string) {
  return view(page).getByRole("group", { name, exact: true });
}

/** An item's button in an area's column. */
function item(page: Page, area: string, title: string) {
  return column(page, area).getByRole("button", { name: title, exact: true });
}

/** The box drawn around an item's button. */
async function boxOf(button: Locator) {
  return (await button.locator("xpath=..").boundingBox())!;
}

async function openAreas(page: Page, path = "/plan/calendar?view=areas") {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: "Calendar" }),
  ).toBeVisible();
  // The view renders once the page hydrates.
  await expect(view(page)).toBeVisible();
}

test("a column per area, overlaps side by side, the keyboard, and the day in the URL", async ({
  page,
}) => {
  test.slow();
  await signInAndConfirm(page);
  await addAreas(page, ["Health", "Work"]);
  await page.goto("/plan/calendar?view=day");
  await expect(page.getByRole("grid")).toBeVisible();
  // 08:00 in Tokyo is still the day before in UTC.
  await addEvent(page, "Dentist", { start: "08:00", area: "Health" });
  await addEvent(page, "Physio", { start: "08:30", area: "Health" });
  await addEvent(page, "Standup", { start: "08:00", area: "Work" });
  await addEvent(page, "Conference");
  await addEvent(page, "Errands", { start: "13:00" });

  await openAreas(page);
  const views = page.getByRole("navigation", { name: "Calendar view" });
  await expect(views.getByRole("link", { name: "By area" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(view(page).getByRole("heading", { level: 2 })).toHaveText([
    "Health",
    "Work",
    "No area",
  ]);
  await expect(item(page, "No area", "Conference")).toHaveAttribute(
    "data-all-day",
    "true",
  );
  await expect(
    item(page, "Health", "Dentist").locator("xpath=.."),
  ).toContainText("8:00 AM – 9:00 AM");
  await expect(item(page, "Work", "Dentist")).toHaveCount(0);

  // Dentist (08:00–09:00) and Physio (08:30–09:30) overlap in Health, so
  // they sit side by side: they share rows but not columns.
  const dentist = await boxOf(item(page, "Health", "Dentist"));
  const physio = await boxOf(item(page, "Health", "Physio"));
  expect(physio.y).toBeGreaterThan(dentist.y);
  expect(physio.y).toBeLessThan(dentist.y + dentist.height);
  expect(physio.x).toBeGreaterThanOrEqual(dentist.x + dentist.width - 1);
  // Standup is in Work's column, level with Dentist, to its right.
  const standup = await boxOf(item(page, "Work", "Standup"));
  expect(Math.abs(standup.y - dentist.y)).toBeLessThan(2);
  expect(standup.x).toBeGreaterThanOrEqual(physio.x + physio.width - 1);
  // Errands at 13:00 sits below the morning, at full width of its column.
  const errands = await boxOf(item(page, "No area", "Errands"));
  expect(errands.y).toBeGreaterThan(physio.y + physio.height);
  await expectNoSeriousViolations(page);

  // Keyboard only: the view is a Tab stop (it scrolls sideways), then its
  // items; arrows move within a column and across to the nearest item.
  await view(page).focus();
  await page.keyboard.press("Tab");
  await expect(item(page, "Health", "Dentist")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(item(page, "Health", "Physio")).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(item(page, "Health", "Physio")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(item(page, "Health", "Dentist")).toBeFocused();
  await page.keyboard.press("ArrowRight");
  await expect(item(page, "Work", "Standup")).toBeFocused();
  // The nearest timed item, not the all-day one.
  await page.keyboard.press("ArrowRight");
  await expect(item(page, "No area", "Errands")).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(item(page, "No area", "Conference")).toBeFocused();
  await page.keyboard.press("ArrowLeft");
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
  await expect(dialog.getByLabel("Life area")).toHaveValue(/.+/);
  await expectNoSeriousViolations(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(item(page, "Health", "Dentist")).toBeFocused();

  // A day at a time, in the URL.
  const move = page.getByRole("navigation", {
    name: "Move through the calendar",
  });
  await move.getByRole("link", { name: "Next day" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/plan/calendar\\?view=areas&date=${tokyoDate(1)}$`),
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
  await move.getByRole("link", { name: "Today" }).click();
  await expect(page).toHaveURL(/\/plan\/calendar\?view=areas$/);
  await expect(item(page, "Health", "Dentist")).toBeVisible();

  // Switching to Day keeps the day.
  await move.getByRole("link", { name: "Next day" }).click();
  await expect(page).toHaveURL(/date=/);
  await views.getByRole("link", { name: "Day" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/plan/calendar\\?view=day&date=${tokyoDate(1)}$`),
  );
});

test("without areas everything is under No area, and a phone scrolls the columns, not the page", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.emulateMedia({ colorScheme: "dark" });
  await signInAndConfirm(page);
  await page.goto("/plan/calendar?view=day");
  await expect(page.getByRole("grid")).toBeVisible();
  await addEvent(page, "Dentist", { start: "09:00" });

  await openAreas(page);
  await expect(view(page).getByRole("heading", { level: 2 })).toHaveText([
    "No area",
  ]);
  await expect(item(page, "No area", "Dentist")).toBeVisible();
  await expect(
    page.getByText("You have no active life areas yet", { exact: false }),
  ).toBeVisible();
  await expectNoSeriousViolations(page);

  // Four columns are wider than a phone: the view scrolls, the page doesn't.
  await addAreas(page, ["Health", "Work", "Learning"]);
  await openAreas(page);
  await expect(view(page).getByRole("heading", { level: 2 })).toHaveCount(4);
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
  // The keyboard scrolls the view sideways.
  await view(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(() => view(page).evaluate((region) => region.scrollLeft))
    .toBeGreaterThan(0);
  await expectNoSeriousViolations(page);
});
