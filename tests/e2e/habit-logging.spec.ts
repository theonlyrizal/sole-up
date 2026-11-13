import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// Habit logging (chunk 6.4): one tap on Today with Undo, amounts for a
// quantity habit, and the Track strip for backfilling and correcting past
// days, with the figure following each change at once. The browser (and so
// the confirmed time zone) is in Tokyo, far from UTC.

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

function todayRow(page: Page, title: string) {
  return page
    .getByRole("region", { name: "Habits" })
    .getByRole("listitem")
    .filter({ hasText: title });
}

async function habitMenu(page: Page, title: string) {
  await todayRow(page, title)
    .getByRole("button", { name: `Actions for ${title}` })
    .click();
  return page.getByRole("menu");
}

/** The toasts that say `title`. */
function toastSaying(page: Page, title: string) {
  return page
    .getByRole("region", { name: /^Notifications/ })
    .getByRole("listitem")
    .filter({ hasText: title });
}

/** The Undo button of the newest toast that says `title`. */
function undoIn(page: Page, title: string) {
  return toastSaying(page, title).last().getByRole("button", { name: "Undo" });
}

async function createHabit(
  page: Page,
  title: string,
  options: { startDate?: string; quantity?: { unit: string; target: string } },
) {
  await page.goto("/track");
  await page.getByRole("button", { name: "New habit" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New habit" });
  await dialog.getByLabel("Title").fill(title);
  if (options.quantity) {
    await dialog.getByRole("radio", { name: "An amount" }).check();
    await dialog.getByLabel("Unit").fill(options.quantity.unit);
    await dialog
      .getByLabel(`Target per day (${options.quantity.unit})`)
      .fill(options.quantity.target);
  }
  if (options.startDate) {
    await dialog.getByLabel("Start date").fill(options.startDate);
  }
  await dialog.getByRole("button", { name: "Add habit" }).click();
  await expect(dialog).toHaveCount(0);
}

async function openToday(page: Page) {
  await page.goto("/plan/today");
  await expect(
    page.getByRole("heading", { level: 2, name: "Habits" }),
  ).toBeVisible();
}

test("done, skip and undo on Today, with amounts for a quantity habit", async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 900, height: 800 });
  await signInAndConfirm(page);
  await createHabit(page, "Stretch", {});
  await createHabit(page, "Drink water", {
    quantity: { unit: "glasses", target: "8" },
  });

  await openToday(page);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Schedule",
    "Planned for today",
    "Habits",
  ]);
  const stretch = todayRow(page, "Stretch");
  const water = todayRow(page, "Drink water");
  await expect(stretch).toContainText("Every day");
  await expect(water).toContainText("Every day · 8 glasses a day");
  await expectNoSeriousViolations(page);

  // One tap, then Undo in the toast puts the day back as it was.
  await page.getByRole("button", { name: "Done: Stretch" }).click();
  await expect(stretch).toContainText("Done");
  await expect(page.getByRole("button", { name: "Done: Stretch" })).toHaveCount(
    0,
  );
  await undoIn(page, "Marked done").click();
  await expect(toastSaying(page, "Undone").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Done: Stretch" }),
  ).toBeVisible();
  const stretchMenu = await habitMenu(page, "Stretch");
  await expect(
    stretchMenu.getByRole("menuitem", { name: "Clear" }),
  ).toHaveCount(0);

  await stretchMenu.getByRole("menuitem", { name: "Skip" }).click();
  await expect(stretch).toContainText("Skipped");
  await expect(toastSaying(page, "Skipped for today")).toBeVisible();
  await habitMenu(page, "Stretch");
  await expect(stretchMenu.getByRole("menuitem", { name: "Skip" })).toHaveCount(
    0,
  );
  await page.keyboard.press("Escape");

  // A quantity habit's Done logs the full target; another amount is a
  // second tap away, and undo goes back to the full target.
  await page.getByRole("button", { name: "Done: Drink water" }).click();
  await expect(water).toContainText("8 of 8 glasses");
  const waterMenu = await habitMenu(page, "Drink water");
  await waterMenu.getByRole("menuitem", { name: "Change amount" }).click();
  const amount = page.getByRole("form", { name: "Amount today: Drink water" });
  await expect(amount.getByLabel("Amount today (glasses)")).toHaveValue("8");
  await amount.getByLabel("Amount today (glasses)").fill("5.5");
  await amount.getByRole("button", { name: "Save" }).click();
  await expect(amount).toHaveCount(0);
  await expect(water).toContainText("5.5 of 8 glasses");
  await expect(
    page.getByRole("button", { name: "Actions for Drink water" }),
  ).toBeFocused();
  await undoIn(page, "Logged 5.5 glasses").click();
  await expect(water).toContainText("8 of 8 glasses");

  // Escape closes the amount form without saving.
  await habitMenu(page, "Drink water");
  await waterMenu.getByRole("menuitem", { name: "Change amount" }).click();
  await amount.getByLabel("Amount today (glasses)").fill("2");
  await page.keyboard.press("Escape");
  await expect(amount).toHaveCount(0);
  await expect(water).toContainText("8 of 8 glasses");

  await habitMenu(page, "Drink water");
  await waterMenu.getByRole("menuitem", { name: "Clear" }).click();
  await expect(toastSaying(page, "Log cleared")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Done: Drink water" }),
  ).toBeVisible();
  await page.mouse.move(0, 0);
  await expectNoSeriousViolations(page);

  // Saved, not just shown: the skip is still there after a reload.
  await openToday(page);
  await expect(todayRow(page, "Stretch")).toContainText("Skipped");
  await expect(
    page.getByRole("button", { name: "Done: Drink water" }),
  ).toBeVisible();
});

test("backfill and correct past days on Track, and the figure follows at once", async ({
  page,
}) => {
  await signInAndConfirm(page);
  // Started a week ago: the seven days before today are expected.
  await createHabit(page, "Read", { startDate: tokyoDate(-7) });

  const read = habitItem(page, "Read");
  await expect(read).toContainText("Last 4 weeks: 0 of 7 days");
  const missed = read.getByRole("button", { name: /: Missed$/ });
  await expect(missed).toHaveCount(7);
  await expectNoSeriousViolations(page);

  // Backfill yesterday as done.
  await missed.last().click();
  let dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Read");
  await expect(dialog.getByRole("radio", { name: "Done" })).toBeChecked();
  await expectNoSeriousViolations(page);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(read).toContainText("Last 4 weeks: 1 of 7 days");
  const yesterday = read.getByRole("button", { name: /: Done$/ });
  await expect(yesterday).toHaveCount(1);
  await expect(yesterday).toBeFocused();

  // Correct it to a deliberate skip: no longer expected, never a miss.
  await yesterday.press("Enter");
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: "Done" })).toBeChecked();
  await dialog.getByRole("radio", { name: "Skipped" }).check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(read).toContainText("Last 4 weeks: 0 of 6 days · 1 skipped");
  await expect(read.getByRole("button", { name: /: Skipped$/ })).toHaveCount(1);

  // Undo puts the correction back.
  await undoIn(page, "Day saved").click();
  await expect(read).toContainText("Last 4 weeks: 1 of 7 days");

  // Escape closes the dialog without saving, and focus returns to the day.
  const day = read.getByRole("button", { name: /: Done$/ });
  await day.click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "No log" }).check();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(day).toBeFocused();
  await expect(read).toContainText("Last 4 weeks: 1 of 7 days");

  // "No log" removes it: the day is missed again.
  await day.click();
  dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "No log" }).check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(read).toContainText("Last 4 weeks: 0 of 7 days");
  await expect(missed).toHaveCount(7);

  // Today, logged on Today, shows on the strip and counts from then on.
  await openToday(page);
  await page.getByRole("button", { name: "Done: Read" }).click();
  await expect(todayRow(page, "Read")).toContainText("Done");
  // The row changes at once; the toast confirms the save.
  await expect(toastSaying(page, "Marked done")).toBeVisible();
  await page.goto("/track");
  await expect(read).toContainText("Last 4 weeks: 1 of 8 days");
  await expect(read.getByRole("button", { name: /: Done$/ })).toHaveCount(1);
});

test("Today distinguishes a pending amount, rollback, confirmed retry and correction", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAndConfirm(page);
  await createHabit(page, "Drink water", {
    quantity: { unit: "glasses", target: "8" },
  });
  await openToday(page);
  const row = page
    .getByRole("region", { name: "Habits", includeHidden: true, exact: true })
    .filter({ visible: true })
    .locator("li")
    .filter({ hasText: "Drink water" });
  const done = row.getByRole("button", { name: "Done: Drink water" });
  const halo = row.locator(".confirmation-halo");
  const activeHalos = () =>
    halo.evaluate((node) => node.getAnimations().length);
  const openAmount = async () => {
    const menu = await habitMenu(page, "Drink water");
    await menu.getByRole("menuitem", { name: "Change amount" }).click();
    return page.getByRole("form", { name: "Amount today: Drink water" });
  };
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.evaluate(() => {
    const animate = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const animation = animate.call(this, keyframes, options);
      if (this.classList.contains("confirmation-halo")) {
        animation.pause();
        animation.currentTime = 35;
      }
      return animation;
    };
  });

  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(
    "**/plan/today",
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      await gate;
      // The app receives the real server validation result for this amount.
      await route.continue();
    },
    { times: 1 },
  );

  let amount = await openAmount();
  const field = amount.getByLabel("Amount today (glasses)");
  await field.fill("5.555");
  await amount.getByRole("button", { name: "Save" }).click();
  await expect(amount).toHaveAttribute("aria-busy", "true");
  await expect(row.locator(".habit-done")).toHaveAttribute("aria-busy", "true");
  await expect(row).not.toContainText("5.555");
  expect(await activeHalos()).toBe(0);
  release();
  await expect(amount.getByRole("alert")).toBeVisible();
  await expect(field).toHaveValue("5.555");
  await expect(row).not.toContainText("of 8 glasses");
  expect(await activeHalos()).toBe(0);

  await field.fill("5.5");
  await amount.getByRole("button", { name: "Save" }).click();
  await expect(amount).toHaveCount(0);
  await expect(row).toContainText("5.5 of 8 glasses");
  await expect(
    row.getByRole("button", { name: "Logged: Drink water, 5.5 of 8 glasses" }),
  ).toBeVisible();
  await expect(row.locator(".habit-done")).toContainText("Logged");
  await expect.poll(activeHalos).toBe(1);

  amount = await openAmount();
  await amount.getByRole("button", { name: "Save" }).click();
  await expect(amount).toHaveCount(0);
  expect(await activeHalos()).toBe(0);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await toastSaying(page, "Logged 5.5 glasses")
    .getByRole("button", { name: "Undo" })
    .click();
  await expect(done).toBeVisible();
  await done.click();
  await expect(row).toContainText("8 of 8 glasses");
  expect(await activeHalos()).toBe(0);
  await openToday(page);
  await expect(row).toContainText("8 of 8 glasses");
  expect(await activeHalos()).toBe(0);
});
