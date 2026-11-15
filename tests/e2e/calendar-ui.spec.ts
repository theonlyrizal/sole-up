import { expect, test } from "@playwright/test";

import { THEME_STORAGE_KEY } from "../../src/lib/theme";
import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";
import {
  CALENDAR_BLOCK_TITLE,
  CALENDAR_SERIES_TITLE,
  seedVisualData,
  VISUAL_ZONE,
} from "./visual-data";

test.use({ timezoneId: VISUAL_ZONE, locale: "en-US" });

test("Go to date moves one focus target through the month grid", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await signInAndConfirm(page);
  await page.goto("/plan/calendar?view=day&date=2028-01-31");
  const trigger = page.getByRole("button", { name: /^Go to date,/ });
  const picker = page.getByRole("dialog", { name: "Go to date" });
  const grid = picker.getByRole("grid");
  await expect(async () => {
    if (!(await picker.isVisible())) await trigger.press("Enter");
    await expect(picker).toBeVisible({ timeout: 1_000 });
  }).toPass();

  const focused = (label: string) =>
    expect(grid.getByRole("button", { name: label })).toBeFocused();
  await focused("Monday, January 31, 2028");
  const monthChips = picker.getByRole("radiogroup", { name: "Browse months" });
  const nextMonth = monthChips.getByRole("radio", { name: "Feb", exact: true });
  await nextMonth.press("Enter");
  await expect(nextMonth).toBeChecked();
  await expect(nextMonth).toBeFocused();
  await expect(grid).toHaveAccessibleName("February 2028");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  await focused("Monday, January 31, 2028");
  await expect(grid.locator('[aria-selected="true"]')).toHaveCount(1);
  const geometry = await grid.evaluate((element) => {
    const buttons = [...element.querySelectorAll("button")];
    return {
      localOverflow:
        element.parentElement!.scrollWidth > element.parentElement!.clientWidth,
      documentOverflow:
        document.documentElement.scrollWidth > window.innerWidth,
      targets: buttons.every((button) => {
        const rect = button.getBoundingClientRect();
        return (
          rect.width >= 48 &&
          rect.height >= 48 &&
          !buttons.some((other) => {
            if (button === other) return false;
            const next = other.getBoundingClientRect();
            return (
              rect.right > next.left &&
              next.right > rect.left &&
              rect.bottom > next.top &&
              next.bottom > rect.top
            );
          })
        );
      }),
    };
  });
  expect(geometry).toEqual({
    localOverflow: true,
    documentOverflow: false,
    targets: true,
  });

  await page.keyboard.press("ArrowLeft");
  await focused("Sunday, January 30, 2028");
  await page.keyboard.press("ArrowRight");
  await focused("Monday, January 31, 2028");
  await page.keyboard.press("ArrowUp");
  await focused("Monday, January 24, 2028");
  await page.keyboard.press("ArrowDown");
  await focused("Monday, January 31, 2028");
  await page.keyboard.press("PageDown");
  await focused("Tuesday, February 29, 2028");
  await page.keyboard.press("PageUp");
  await focused("Saturday, January 29, 2028");
  await page.keyboard.press("Home");
  await focused("Monday, January 24, 2028");
  await page.keyboard.press("End");
  await focused("Sunday, January 30, 2028");
  await expect(grid.locator('button[tabindex="0"]')).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  await focused("Monday, January 31, 2028");
  await page.keyboard.press("PageDown");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/view=day&date=2028-02-29$/);

  await page.goto("/plan/calendar?start=2028-01-31&days=7");
  await expect(async () => {
    if (!(await picker.isVisible())) await trigger.press("Enter");
    await expect(picker).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/start=2028-02-01&days=7$/);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  for (const theme of ["light", "dark"] as const) {
    test(`Calendar axe at ${viewport.width}px in ${theme}`, async ({
      page,
    }) => {
      test.setTimeout(90_000);
      await page.setViewportSize(viewport);
      await page.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      const { today } = await seedVisualData(page, { calendar: true });
      for (const view of ["agenda", "week", "day", "areas", "timeline"]) {
        await page.goto(
          `/plan/calendar?view=${view}${view === "timeline" ? "&span=day" : ""}`,
        );
        if (view === "week" && viewport.width === 390) {
          await expect(page).toHaveURL(/view=day$/);
        }
        await expect(
          page
            .getByRole("button", { name: CALENDAR_SERIES_TITLE, exact: true })
            .first(),
        ).toBeVisible();
        await expectNoSeriousViolations(page);
      }

      await page.goto("/plan/calendar?view=day");
      await expect(
        page.locator(".soleup-calendar-day [data-calendar-item]").first(),
      ).toBeVisible();
      await page.getByRole("button", { name: /^Go to date,/ }).click();
      const picker = page.getByRole("dialog", { name: "Go to date" });
      await expect(picker.getByRole("grid")).toBeVisible();
      await expect(
        picker.locator('[aria-selected="true"] [aria-current="date"]'),
      ).toHaveCount(1);
      await expectNoSeriousViolations(page);
      await page.keyboard.press("Escape");
      await expect(picker).toHaveCount(0);
      const series = page.getByRole("button", {
        name: CALENDAR_SERIES_TITLE,
        exact: true,
      });
      await series.click();
      const edit = page.getByRole("dialog", { name: "Edit event" });
      await expectNoSeriousViolations(page);
      await edit.getByRole("button", { name: "Save", exact: true }).click();
      await expect(
        edit.getByRole("radio", { name: "This event", exact: true }),
      ).toBeFocused();
      await expectNoSeriousViolations(page);
      await edit.getByRole("button", { name: "Back" }).click();
      await edit
        .getByRole("button", { name: `Delete: ${CALENDAR_SERIES_TITLE}` })
        .click();
      const remove = page.getByRole("alertdialog");
      await expect(
        remove.getByRole("radio", { name: "All events" }),
      ).toHaveAccessibleDescription(/changed separately/);
      await expectNoSeriousViolations(page);
      await page.keyboard.press("Escape");
      await expect(remove).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(series).toBeFocused();

      await page
        .getByRole("button", { name: CALENDAR_BLOCK_TITLE, exact: true })
        .click();
      await expect(
        page.getByRole("dialog", { name: "Time block", exact: true }),
      ).toBeVisible();
      await expectNoSeriousViolations(page);
      await page.keyboard.press("Escape");
      const addBlock = page.getByRole("button", {
        name: "Block time",
        exact: true,
      });
      await addBlock.click();
      const blockForm = page.getByRole("dialog", {
        name: "Block time",
        exact: true,
      });
      await expect(
        blockForm.getByRole("group", { name: "End", exact: true }),
      ).toBeVisible();
      await expectNoSeriousViolations(page);
      await page.keyboard.press("Escape");
      await expect(addBlock).toBeFocused();
      expect(new URL(page.url()).searchParams.get("date")).toBeNull();
      await expect(
        page
          .locator(
            `.soleup-calendar-day [aria-current="date"][data-date="${today}"]`,
          )
          .first(),
      ).toBeAttached();
    });
  }
}
