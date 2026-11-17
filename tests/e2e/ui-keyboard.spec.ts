import { expect, test, type Locator, type Page } from "@playwright/test";

import { THEME_STORAGE_KEY } from "../../src/lib/theme";
import { desktop, phone } from "./audit-routes";
import { openRenderedPage, tabTo } from "./helpers";
import {
  CALENDAR_BLOCK_TITLE,
  DAILY_HABIT,
  GOAL_TITLE,
  seedVisualData,
  VISUAL_ZONE,
} from "./visual-data";

test.use({ timezoneId: VISUAL_ZONE, locale: "en-US" });

async function tabToVisibleControl(page: Page, control: Locator) {
  await tabTo(page, control);
  await expect(control.and(page.locator(":focus-visible"))).toHaveCount(1);
  await expect(control).toBeInViewport();
}

for (const [viewport, theme] of [
  [phone, "dark"],
  [desktop, "light"],
] as const) {
  test(`keyboard walkthrough at ${viewport.width}px in ${theme}`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.setViewportSize(viewport);
    await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
    await page.addInitScript((key) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, "system");
    }, THEME_STORAGE_KEY);
    await seedVisualData(page);
    const capture = (name: string) =>
      page.screenshot({ path: testInfo.outputPath(`${name}.png`) });
    const activate = async (control: Locator) => {
      await tabToVisibleControl(page, control);
      await page.keyboard.press("Enter");
    };
    const main = page.getByRole("main");
    const nav = page.getByRole("navigation", { name: "Main" });
    const more = nav.getByRole("button", { name: "More", exact: true });
    const compact = viewport.width === phone.width;

    async function openDestination(name: string) {
      if (compact) {
        await activate(more);
        await activate(
          page.getByRole("dialog").getByRole("link", { name, exact: true }),
        );
      } else {
        await activate(nav.getByRole("link", { name, exact: true }));
      }
    }

    await test.step("Follow a goal's task into Today and complete it", async () => {
      await openRenderedPage(page, "/goals");
      await activate(main.getByRole("link", { name: GOAL_TITLE, exact: true }));
      await expect(
        main.getByRole("heading", { name: GOAL_TITLE, level: 1 }),
      ).toBeVisible();
      await activate(nav.getByRole("link", { name: "Plan", exact: true }));
      await expect(page).toHaveURL(/\/plan$/);
      await activate(main.getByRole("link", { name: "Today", exact: true }));
      const planned = main.getByRole("region", { name: "Planned for today" });
      await expect(
        planned.getByText(GOAL_TITLE, { exact: true }),
      ).toBeVisible();
      await tabToVisibleControl(
        page,
        planned.getByRole("checkbox", {
          name: `Complete ${CALENDAR_BLOCK_TITLE}`,
        }),
      );
      await capture("goals-to-today-focus");
      await page.keyboard.press("Space");
      await expect(
        page.getByText("Task completed", { exact: true }),
      ).toBeVisible();
    });

    await test.step("Log a habit and confirm the saved state after reload", async () => {
      const done = main.getByRole("button", { name: `Done: ${DAILY_HABIT}` });
      await activate(done);
      await expect(
        page.getByText("Marked done", { exact: true }),
      ).toBeVisible();
      await expect(done).toHaveCount(0);
      await capture("habit-saved-reduced-motion");
      await page.reload();
      const row = main
        .getByRole("region", { name: "Habits" })
        .getByRole("listitem")
        .filter({ hasText: DAILY_HABIT });
      await expect(row.getByText("Done", { exact: true })).toBeVisible();
    });

    await test.step("Write and finish a weekly review", async () => {
      await openDestination("Review");
      await activate(main.getByRole("button", { name: "Next: Reflect" }));
      await tabToVisibleControl(page, main.getByLabel("Wins", { exact: true }));
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type("Made time to walk before dinner.");
      await activate(main.getByRole("button", { name: "Next: Adjust" }));
      await activate(
        main.getByRole("button", { name: "Next: Choose priorities" }),
      );
      await activate(main.getByRole("button", { name: "Finish review" }));
      const sheet = page.getByRole("dialog", { name: "Your review is saved" });
      await expect(sheet).toBeVisible();
      await capture("review-finished");
      await activate(sheet.getByRole("button", { name: "Done", exact: true }));
      await expect(sheet).toHaveCount(0);
      await page.reload();
      await expect(main.getByText(/Finished on/)).toBeVisible();
      await expect(sheet).toHaveCount(0);
    });

    await test.step("Write a note and wait for confirmed autosave", async () => {
      await openDestination("Notes");
      await expect(
        main.getByRole("heading", { level: 1, name: "Notes" }),
      ).toBeVisible();
      if (compact) {
        await activate(
          page.getByRole("button", { name: "Create", exact: true }),
        );
        const newNote = page.getByRole("menuitem", { name: "New note" });
        await expect(newNote).toBeFocused();
        await page.keyboard.press("Enter");
      } else {
        await activate(
          main.getByRole("link", { name: "New note", exact: true }).first(),
        );
      }
      await expect(
        main.getByRole("textbox", { name: "Note", exact: true }),
      ).toBeEditable();
      await tabToVisibleControl(
        page,
        main.getByRole("textbox", { name: "Title", exact: true }),
      );
      await page.keyboard.type("Keyboard field notes");
      await tabToVisibleControl(
        page,
        main.getByRole("textbox", { name: "Note", exact: true }),
      );
      await page.keyboard.type("The path is dry this week.");
      await expect(
        main.getByRole("status").filter({ hasText: /^Saved$/ }),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
      await capture("note-saved");
      await page.reload();
      await expect(
        main.getByRole("textbox", { name: "Note", exact: true }),
      ).toHaveText("The path is dry this week.");
    });

    await test.step("Change the appearance setting and confirm it persisted", async () => {
      await openDestination("Settings");
      const group = main.getByRole("radiogroup", { name: "Color theme" });
      const chosen = theme === "dark" ? "light" : "dark";
      const selected = group.getByRole("radio", {
        name: chosen === "light" ? "Light" : "Dark",
      });
      await tabToVisibleControl(
        page,
        group.getByRole("radio", { name: "System" }),
      );
      await page.keyboard.press("ArrowRight");
      if (chosen === "dark") {
        await expect(group.getByRole("radio", { name: "Light" })).toBeFocused();
        await page.keyboard.press("ArrowRight");
      }
      await expect(selected).toBeFocused();
      await page.keyboard.press("Space");
      await expect(selected).toBeChecked();
      await expect(page.locator("html")).toHaveAttribute("data-theme", chosen);
      await capture("setting-saved");
      await page.reload();
      await expect(page.locator("html")).toHaveAttribute("data-theme", chosen);
      await expect(selected).toBeChecked();
    });
  });
}
