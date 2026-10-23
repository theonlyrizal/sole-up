import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

function milestoneSection(page: Page) {
  return page.getByRole("region", { name: "Milestones" });
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

test("create → milestone → archive → restore to Active → delete", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await createGoalAndOpen(page, "Learn the cello");
  await addMilestone(page, "Rent a cello");
  await addMilestone(page, "Book a first lesson");
  await addMilestone(page, "Play a scale");

  // Archive from the detail page; the goal leaves the Goals list.
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(
    page.getByRole("definition").getByText("Archived", { exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "← Goals" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Archived goals" }),
  ).toBeVisible();

  // The archive view lists it; restore asks first and says where it lands.
  const archived = page
    .getByRole("list")
    .filter({ hasText: "Learn the cello" });
  await expect(archived.getByText(/Archived on /)).toBeVisible();
  await expectNoSeriousViolations(page);
  await page.getByRole("button", { name: "Restore: Learn the cello" }).click();
  const restore = page.getByRole("alertdialog", {
    name: "Restore “Learn the cello”?",
  });
  await expect(restore).toContainText("It moves back to Active");
  await expectNoSeriousViolations(page);
  await restore.getByRole("button", { name: "Restore to Active" }).click();
  await expect(restore).toHaveCount(0);
  await expect(
    page.getByRole("heading", { level: 2, name: "Nothing archived" }),
  ).toBeVisible();

  // It's back in Active, with its milestones.
  await page.goto("/goals");
  await expect(page.getByRole("link", { name: "Archived (0)" })).toBeVisible();
  await expect(page.getByText("0 of 3 milestones")).toBeVisible();
  await page.getByRole("link", { name: "Learn the cello" }).click();
  await expect(
    page.getByRole("definition").getByText("Active", { exact: true }),
  ).toBeVisible();

  // Delete states exactly what goes, then leaves the gone page.
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("alertdialog", {
    name: "Delete “Learn the cello”?",
  });
  await expect(confirm).toContainText("3 milestones will be deleted.");
  await expect(confirm).toContainText("It can't be undone.");
  await confirm.getByRole("button", { name: "Delete goal" }).click();
  await expect(page).toHaveURL(/\/goals$/);
  await expect(
    page.getByRole("heading", { level: 2, name: "No active goals" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Learn the cello" })).toHaveCount(
    0,
  );
});

test("archived goals show their completed date and can be deleted from the archive", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await createGoalAndOpen(page, "Finish the quilt");
  await page.getByRole("button", { name: "Mark complete" }).click();
  await expect(page.getByText(/Completed on /)).toBeVisible();
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(
    page.getByRole("definition").getByText("Archived", { exact: true }),
  ).toBeVisible();

  await page.goto("/goals");
  await page.getByRole("link", { name: "Archived (1)" }).click();
  await expect(page.getByText(/Completed on .* · Archived on /)).toBeVisible();

  // Cancel keeps it; confirming removes it.
  await page.getByRole("button", { name: "Delete: Finish the quilt" }).click();
  const confirm = page.getByRole("alertdialog", {
    name: "Delete “Finish the quilt”?",
  });
  await expect(confirm).toContainText("It has no milestones or tasks.");
  await expect(confirm).not.toContainText("archive it");
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(
    page.getByRole("link", { name: "Finish the quilt" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Delete: Finish the quilt" }).click();
  await confirm.getByRole("button", { name: "Delete goal" }).click();
  await expect(
    page.getByRole("heading", { level: 2, name: "Nothing archived" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 2, name: "Nothing archived" }),
  ).toBeVisible();
});
