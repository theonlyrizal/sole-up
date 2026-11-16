import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// Track's history (chunk 6.5): the last 4 weeks by default, the last 12 or
// this week alone, kept in the URL; each habit's strip by week with its
// figure and the definition in its info button; this week as progress, not a figure.
// The browser (and so the confirmed time zone) is in Tokyo, far from UTC.

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

function weekLists(page: Page, title: string) {
  return page.getByRole("list", { name: new RegExp(`^${title}: Week of `) });
}

function rangeLink(page: Page, name: string) {
  return page
    .getByRole("navigation", { name: "Range to show" })
    .getByRole("link", { name, exact: true });
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

test("switch ranges, backfill an old week, and see this week as progress", async ({
  page,
}) => {
  await signInAndConfirm(page);
  // Started well before the oldest of the last 12 weeks.
  await createHabit(page, "Read", tokyoDate(-90));
  const read = habitItem(page, "Read");

  // The default: the last 4 weeks, this week last, the definition behind the info button.
  await expect(rangeLink(page, "Last 4 weeks")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(weekLists(page, "Read")).toHaveCount(4);
  await expect(read).toContainText(/0 of \d+ days/);
  const info = read.getByRole("button", { name: "How this is counted: Read" });
  await info.click();
  const definition = page.getByRole("dialog", { name: "How this is counted" });
  await expect(definition).toContainText("Today counts only once it's logged");
  await definition.getByRole("button", { name: "Close" }).click();
  await expect(info).toBeFocused();
  await expect(read).not.toContainText("%");
  await expect(read).not.toContainText(/streak/i);

  // The last 12 weeks, in the URL.
  await rangeLink(page, "Last 12 weeks").click();
  await expect(page).toHaveURL(/\/track\?range=12w$/);
  await expect(rangeLink(page, "Last 12 weeks")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(weekLists(page, "Read")).toHaveCount(12);
  const figure = read.getByText(/^\d+ of \d+ days$/, { exact: true });
  await expect(figure).toHaveText(/^0 of \d+ days$/);
  await page.mouse.move(0, 0);
  await expectNoSeriousViolations(page);

  // Backfill a day in the oldest week; the range stays and the figure moves.
  const oldest = weekLists(page, "Read").first();
  await oldest
    .getByRole("button", { name: /: Missed$/ })
    .first()
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("radio", { name: "Done" })).toBeChecked();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(figure).toHaveText(/^1 of \d+ days$/);
  await expect(oldest.getByRole("button", { name: /: Done$/ })).toHaveCount(1);
  await expect(page).toHaveURL(/\/track\?range=12w$/);

  // Out of the last 4 weeks, so not in that figure.
  await rangeLink(page, "Last 4 weeks").click();
  await expect(page).toHaveURL(/\/track$/);
  await expect(read).toContainText(/0 of \d+ days/);

  // This week alone: progress so far, never a consistency figure.
  await rangeLink(page, "This week").click();
  await expect(page).toHaveURL(/\/track\?range=week$/);
  await expect(weekLists(page, "Read")).toHaveCount(1);
  await expect(read).toContainText(/0 of 7 days so far this week/);
  await expect(read).not.toContainText(/Last \d+ weeks:/);
  await info.click();
  await expect(definition).toContainText("This week shows what's done so far");
  await page.keyboard.press("Escape");
  await expectNoSeriousViolations(page);

  // An unknown range falls back to the default.
  await page.goto("/track?range=52w");
  await expect(rangeLink(page, "Last 4 weeks")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(weekLists(page, "Read")).toHaveCount(4);
});
test("Home's habit link places the card below the compact app bar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signInAndConfirm(page);
  await createHabit(page, "Read", tokyoDate(-7));
  await createHabit(page, "Last habit", tokyoDate(-7));
  await page.goto("/home");
  const link = page.getByRole("link", { name: "Last habit", exact: true });
  await expect(link).toHaveAttribute("href", /^\/track#habit-/);
  await link.click();
  await expect(page).toHaveURL(/\/track#habit-/);
  await expect
    .poll(async () =>
      habitItem(page, "Last habit").evaluate((card) => {
        const bar = document
          .querySelector(".top-app-bar")!
          .getBoundingClientRect();
        const title = card.querySelector("h3")!.getBoundingClientRect();
        return (
          card.getBoundingClientRect().top >= bar.bottom &&
          title.bottom <= window.innerHeight
        );
      }),
    )
    .toBe(true);
});

test("keyboard backfill and static non-loggable days in all three layouts", async ({
  page,
}) => {
  test.slow();
  await page.setViewportSize({ width: 1280, height: 800 });
  await signInAndConfirm(page);

  // Start this week five days ago regardless of the date on the host.
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const weekStart = new Date(tokyoDate(-5) + "T00:00:00Z").getUTCDay();
  await page.getByLabel("Week starts on").selectOption(String(weekStart));
  const settings = page.getByRole("region", { name: "Time and region" });
  await settings.getByRole("button", { name: "Save", exact: true }).click();
  await expect(settings.getByRole("status")).toHaveText("Saved.");
  await page.reload();
  await expect(page.getByLabel("Week starts on")).toHaveValue(
    String(weekStart),
  );
  await page.setViewportSize({ width: 320, height: 844 });
  await createHabit(page, "Read", tokyoDate(-3));

  const read = habitItem(page, "Read");
  for (const { range, layout, date } of [
    { range: "This week", layout: "week", date: tokyoDate(-2) },
    { range: "Last 4 weeks", layout: "calendar", date: tokyoDate(-1) },
    { range: "Last 12 weeks", layout: "matrix", date: tokyoDate(-3) },
  ]) {
    await rangeLink(page, range).press("Enter");
    const graph = read.locator(`.habit-history[data-layout="${layout}"]`);
    await expect(graph).toBeVisible();
    const statics = graph.getByRole("img", {
      name: /: (Coming up|Not active)$/,
    });
    expect(await statics.count()).toBeGreaterThan(0);
    await expect(
      graph.getByRole("button", { name: /: (Coming up|Not active)$/ }),
    ).toHaveCount(0);
    expect(
      await statics.evaluateAll((marks) =>
        marks.every(
          (mark) =>
            (mark as HTMLElement).tabIndex < 0 && !mark.closest("button"),
        ),
      ),
    ).toBe(true);

    const fit = await graph.evaluate((chart) => {
      const scroller = chart.querySelector(".habit-history-scroll")!;
      const days = Array.from(chart.querySelectorAll(".habit-day-target"));
      return {
        local: scroller.scrollWidth > scroller.clientWidth,
        page: document.documentElement.scrollWidth === window.innerWidth,
        targets: days.every((day, index) => {
          const bounds = day.getBoundingClientRect();
          const next = days[index + 1]?.getBoundingClientRect();
          return (
            bounds.width >= 48 &&
            bounds.height >= 48 &&
            (!next ||
              next.top >= bounds.bottom ||
              next.left >= bounds.right - 0.01)
          );
        }),
      };
    });
    expect(fit).toEqual({ local: true, page: true, targets: true });
    await graph.getByRole("button", { name: /Today, not logged yet$/ }).focus();
    await expect
      .poll(() =>
        graph
          .locator(".habit-history-scroll")
          .evaluate((element) => element.scrollLeft),
      )
      .toBeGreaterThan(0);

    const dateLabel = new Intl.DateTimeFormat("en-US", {
      dateStyle: "full",
      timeZone: "UTC",
    }).format(new Date(date + "T00:00:00Z"));
    const button = graph.getByRole("button", {
      name: dateLabel + ": Missed",
      exact: true,
    });
    await button.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: dateLabel });
    const done = dialog.getByRole("radio", { name: "Done" });
    await expect(done).toBeChecked();
    // Choose the status and submit using the keyboard.
    await done.focus();
    await page.keyboard.press("ArrowDown");
    await expect(dialog.getByRole("radio", { name: "Skip" })).toBeChecked();
    await page.keyboard.press("ArrowUp");
    await dialog.getByRole("button", { name: "Save", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeHidden();
    await expect(
      graph.getByRole("button", {
        name: dateLabel + ": Done",
        exact: true,
      }),
    ).toBeFocused();
  }
});
