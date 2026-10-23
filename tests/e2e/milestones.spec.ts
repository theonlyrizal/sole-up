import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

const PROGRESS = /^\d+ of \d+ milestones?$/;

function milestoneSection(page: Page) {
  return page.getByRole("region", { name: "Milestones" });
}

/** Milestone titles in list order. */
function milestoneTitles(page: Page) {
  return milestoneSection(page).locator("ol > li label span");
}

async function addMilestone(page: Page, title: string) {
  const input = milestoneSection(page).getByRole("textbox", {
    name: "New milestone",
  });
  await input.fill(title);
  await input.press("Enter");
  await expect(
    milestoneSection(page).getByText(title, { exact: true }),
  ).toBeVisible();
}

async function createGoalAndOpen(page: Page, title: string) {
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New goal" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Add goal" }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("link", { name: title }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: title }),
  ).toBeVisible();
}

test("a goal with no milestones shows no progress, and the list adds and reorders them", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await createGoalAndOpen(page, "Ship the portfolio");

  // Zero milestones: an empty state, and no progress figure or percentage.
  await expect(
    milestoneSection(page).getByText("No milestones yet."),
  ).toBeVisible();
  await expect(milestoneSection(page).getByText(PROGRESS)).toHaveCount(0);
  await expect(milestoneSection(page).getByText("%")).toHaveCount(0);

  await addMilestone(page, "Draft the case studies");
  await addMilestone(page, "Record the demo");
  await addMilestone(page, "Write the about page");

  // The definition is visible next to the progress.
  await expect(
    milestoneSection(page).getByText("0 of 3 milestones"),
  ).toBeVisible();
  await expect(
    milestoneSection(page).getByText(/Dropped milestones don't count/),
  ).toBeVisible();
  await expectNoSeriousViolations(page);

  // Reorder from the keyboard: focus the button, press Enter. Focus stays on
  // the pressed button, and the order survives a reload.
  await milestoneSection(page)
    .getByRole("button", { name: "Move Write the about page up" })
    .focus();
  const saved = page.waitForResponse(
    (response) => response.request().method() === "POST",
  );
  await page.keyboard.press("Enter");
  // Focus can stay on the button while the save is still in flight, so wait
  // for the server before reloading.
  await saved;
  await expect(milestoneTitles(page)).toHaveText([
    "Draft the case studies",
    "Write the about page",
    "Record the demo",
  ]);
  await expect(
    milestoneSection(page).getByRole("button", {
      name: "Move Write the about page up",
    }),
  ).toBeFocused();
  await page.reload();
  await expect(milestoneTitles(page)).toHaveText([
    "Draft the case studies",
    "Write the about page",
    "Record the demo",
  ]);

  // Complete one, drop one: only the countable two are in the progress.
  await milestoneSection(page)
    .getByRole("checkbox", { name: "Draft the case studies" })
    .click();
  await expect(
    milestoneSection(page).getByText("1 of 3 milestones"),
  ).toBeVisible();
  await milestoneSection(page)
    .getByRole("button", { name: "Drop Write the about page" })
    .click();
  await expect(
    milestoneSection(page).getByText("1 of 2 milestones"),
  ).toBeVisible();
  await expect(
    milestoneSection(page).getByText("Dropped", { exact: true }),
  ).toBeVisible();

  // Finishing the rest offers, never forces, completing the goal.
  await milestoneSection(page)
    .getByRole("checkbox", { name: "Record the demo" })
    .click();
  await expect(
    milestoneSection(page).getByText("2 of 2 milestones"),
  ).toBeVisible();
  await expect(
    page.getByText("Every milestone is done. Mark the goal complete?"),
  ).toBeVisible();

  // Dropping everything leaves nothing to count, so no progress shows.
  await milestoneSection(page)
    .getByRole("button", { name: "Drop Record the demo" })
    .click();
  await milestoneSection(page)
    .getByRole("button", { name: "Drop Draft the case studies" })
    .click();
  await expect(milestoneSection(page).getByText(PROGRESS)).toHaveCount(0);
  await expect(
    page.getByText("Every milestone is done. Mark the goal complete?"),
  ).toHaveCount(0);

  // The goals list shows the same count for a goal that has one.
  await page.getByRole("button", { name: "Restore Record the demo" }).click();
  await page.getByRole("link", { name: "← Goals" }).click();
  // Next keeps the detail page mounted but hidden after navigating, with
  // its own "0 of 1 milestone", so look inside the list's group only.
  await expect(
    page.getByRole("region", { name: "No area" }).getByText("0 of 1 milestone"),
  ).toBeVisible();
});
