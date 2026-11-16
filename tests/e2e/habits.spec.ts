import { THEME_STORAGE_KEY } from "../../src/lib/theme";
import { seedVisualData, VISUAL_ZONE } from "./visual-data";

import { expect, test, type Page } from "@playwright/test";

import {
  chooseGoalMenuItem,
  expectNoSeriousViolations,
  signInAndConfirm,
} from "./helpers";

function habitItem(page: Page, title: string) {
  return page
    .getByRole("listitem")
    .filter({ has: page.getByRole("heading", { name: title, exact: true }) });
}

async function openNewHabit(page: Page) {
  await page.getByRole("button", { name: "New habit" }).first().click();
  return page.getByRole("dialog", { name: "New habit" });
}

test("create check and quantity habits, then edit the schedule from this week", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", {
      name: "Track",
    })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Track" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No habits yet" }),
  ).toBeVisible();
  await expectNoSeriousViolations(page);

  // A check habit on chosen days. The measure is fixed once created.
  let dialog = await openNewHabit(page);
  await expect(dialog.getByText("This can't be changed later.")).toBeVisible();
  await dialog.getByLabel("Title").fill("Stretch");
  await dialog.getByRole("radio", { name: "On chosen days" }).check();
  for (const day of ["Monday", "Wednesday", "Friday"]) {
    await dialog.getByRole("button", { name: day, exact: true }).click();
  }
  await expectNoSeriousViolations(page);
  await dialog.getByRole("button", { name: "Add habit" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(habitItem(page, "Stretch")).toContainText("Mon, Wed, Fri");

  // A quantity habit: the errors name each missing field.
  dialog = await openNewHabit(page);
  await dialog.getByRole("radio", { name: "Quantity" }).click();
  await dialog.getByRole("button", { name: "Add habit" }).click();
  await expect(dialog.getByLabel("Title")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(dialog.getByText("Give the habit a title.")).toBeVisible();
  await expect(dialog.getByLabel("Unit")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await expect(
    dialog.getByRole("textbox", { name: /^Target per day/ }),
  ).toHaveAttribute("aria-invalid", "true");
  await page.mouse.move(0, 0);
  await expectNoSeriousViolations(page);

  await dialog.getByLabel("Title").fill("Drink water");
  await dialog.getByLabel("Unit").fill("glasses");
  await dialog
    .getByLabel("Target per day (glasses)", { exact: true })
    .fill("8");
  await dialog.getByRole("radio", { name: "A number of times a week" }).check();
  await dialog.getByLabel("Times a week", { exact: true }).fill("3");
  await dialog.getByRole("button", { name: "Add habit" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(habitItem(page, "Drink water")).toContainText(
    "3 times a week · 8 glasses a day",
  );

  // Editing the schedule says it applies from this week. All seven days
  // becomes daily.
  await chooseGoalMenuItem(page, "Edit", "Actions for Stretch");
  dialog = page.getByRole("dialog", { name: "Edit habit" });
  await expect(
    dialog.getByText(/apply from the start of this week/),
  ).toBeVisible();
  await expect(dialog.getByText("Measured as done or not.")).toBeVisible();
  await expect(dialog.getByRole("radio", { name: "Check" })).toHaveCount(0);
  for (const day of ["Tuesday", "Thursday", "Saturday", "Sunday"]) {
    await dialog.getByRole("button", { name: day, exact: true }).click();
  }
  await expect(dialog.getByText(/saved as a daily habit/)).toBeVisible();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(habitItem(page, "Stretch")).toContainText("Every day");

  await chooseGoalMenuItem(page, "Edit", "Actions for Drink water");
  dialog = page.getByRole("dialog", { name: "Edit habit" });
  await expect(dialog.getByLabel("Unit")).toHaveCount(0);
  await expect(dialog.getByLabel("Times a week", { exact: true })).toHaveValue(
    "3",
  );
  await dialog
    .getByLabel("Target per day (glasses)", { exact: true })
    .fill("6.5");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(habitItem(page, "Drink water")).toContainText(
    "3 times a week · 6.5 glasses a day",
  );
});

test("pause and resume, archive and restore, then a confirmed delete", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await page.goto("/track");
  const dialog = await openNewHabit(page);
  await dialog.getByLabel("Title").fill("Meditate");
  await dialog.getByRole("button", { name: "Add habit" }).click();
  await expect(dialog).toHaveCount(0);

  const active = page.getByRole("region", { name: "Active" });
  const paused = page.getByRole("region", { name: "Paused" });

  await chooseGoalMenuItem(page, "Pause", "Actions for Meditate");
  await expect(paused.getByRole("heading", { name: "Meditate" })).toBeVisible();
  await expect(active).toHaveCount(0);
  await expectNoSeriousViolations(page);

  await page.getByRole("button", { name: "Resume", exact: true }).click();
  await expect(active.getByRole("heading", { name: "Meditate" })).toBeVisible();
  await expect(paused).toHaveCount(0);

  // Archive moves it out of Track; Restore asks, then makes it active.
  await chooseGoalMenuItem(page, "Archive", "Actions for Meditate");
  await expect(
    page.getByRole("heading", { name: "No habits yet" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Archived (1)" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Archived habits" }),
  ).toBeVisible();
  await expect(habitItem(page, "Meditate")).toContainText(/Archived on /);
  await expectNoSeriousViolations(page);

  await page.getByRole("button", { name: "Restore: Meditate" }).click();
  const restore = page.getByRole("alertdialog", {
    name: "Restore “Meditate”?",
  });
  await restore.getByRole("button", { name: "Restore to active" }).click();
  await expect(
    page.getByRole("heading", { name: "Nothing archived" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Back to Track" }).click();
  await expect(active.getByRole("heading", { name: "Meditate" })).toBeVisible();

  // Delete names what goes with it, and Cancel keeps the habit.
  await chooseGoalMenuItem(page, "Delete…", "Actions for Meditate");
  const confirm = page.getByRole("alertdialog", {
    name: "Delete “Meditate”?",
  });
  await expect(confirm).toContainText("It has no logs yet.");
  await expect(confirm).toContainText("archive it");
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  await expectNoSeriousViolations(page);
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(habitItem(page, "Meditate")).toBeVisible();

  await chooseGoalMenuItem(page, "Delete…", "Actions for Meditate");
  await confirm.getByRole("button", { name: "Delete habit" }).click();
  await expect(
    page.getByRole("heading", { name: "No habits yet" }),
  ).toBeVisible();
});

test("a habit can be created with the keyboard alone", async ({ page }) => {
  await signInAndConfirm(page);
  await page.goto("/track");
  await expect(
    page.getByRole("heading", { level: 1, name: "Track" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "New habit" }).first().focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "New habit" });
  const title = dialog.getByLabel("Title");
  await expect(title).toBeFocused();
  await page.keyboard.type("Journal");

  // Tab to the measure, then to how often; arrows pick within each group.
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("radio", { name: "Check" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("radio", { name: "Every day" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(
    dialog.getByRole("radio", { name: "On chosen days" }),
  ).toBeChecked();
  await page.keyboard.press("Tab");
  const monday = dialog.getByRole("button", { name: "Monday", exact: true });
  await expect(monday).toBeFocused();
  const outline = await monday.evaluate(
    (element) => getComputedStyle(element).outlineStyle,
  );
  expect(outline).not.toBe("none");
  await page.keyboard.press("Space");
  await expect(monday).toHaveAttribute("aria-pressed", "true");

  // Enter in the title submits the form.
  await title.focus();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  await expect(habitItem(page, "Journal")).toContainText("Mon");
});
for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
]) {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`habit accessibility ${viewport.width} ${theme}`, () => {
      test.use({
        viewport,
        colorScheme: theme,
        timezoneId: VISUAL_ZONE,
        reducedMotion: "reduce",
      });
      test("scans all layouts, the habit form, day sheet and archive", async ({
        page,
      }) => {
        test.slow();
        await page.addInitScript(
          (key) => localStorage.setItem(key, "system"),
          THEME_STORAGE_KEY,
        );
        await seedVisualData(page, { track: true });
        for (const path of ["/track", "/track?range=4w", "/track?range=12w"]) {
          await page.goto(path);
          await expect(habitItem(page, "Morning stretch")).toBeVisible();
          await expectNoSeriousViolations(page);
        }
        const form = await openNewHabit(page);
        await form
          .getByRole("radio", { name: "Quantity", exact: true })
          .click();
        await form
          .getByRole("radio", { name: "On chosen days", exact: true })
          .click();
        await expectNoSeriousViolations(page);
        await page.keyboard.press("Escape");
        const quantity = habitItem(
          page,
          "Read a few pages before the afternoon commute",
        );
        await quantity
          .getByRole("button", { name: /: 6 of 12 pages$/ })
          .click();
        await expect(page.getByRole("dialog")).toBeVisible();
        await expectNoSeriousViolations(page);
        await page.keyboard.press("Escape");
        if (viewport.width === 390) {
          const options = page.getByRole("button", { name: "Track options" });
          await options.press("Enter");
          await page.getByRole("menuitem", { name: "Legend" }).press("Enter");
          await expect(
            page.getByRole("button", { name: "Legend" }),
          ).toBeFocused();
          await expect(
            page.getByRole("list", { name: "What the days show" }),
          ).toBeVisible();
          await options.press("Enter");
          await page
            .getByRole("menuitem", { name: "Archived (1)" })
            .press("Enter");
        } else {
          await page.getByRole("link", { name: "Archived (1)" }).click();
        }
        await expect(page).toHaveURL(/\/track\/archived$/);
        await expect(
          page.getByRole("heading", { name: "Practice guitar" }),
        ).toBeVisible();
        await expectNoSeriousViolations(page);
      });
    });
  }
}
