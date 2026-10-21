import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

function historySummaries(page: Page) {
  return page
    .getByRole("region", { name: "History" })
    .locator("ol > li > div > span");
}

async function changeStatus(page: Page, label: string, summary: string) {
  await page.getByRole("button", { name: label, exact: true }).click();
  await expect(historySummaries(page).first()).toHaveText(summary);
}

test("the detail page shows the goal and its history after several status changes", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New goal" });
  await dialog.getByLabel("Title").fill("Learn Spanish");
  await dialog
    .getByLabel("Why does this matter?")
    .fill("To talk with my grandparents.");
  await dialog.getByLabel("Priority").selectOption("high");
  await dialog.getByRole("button", { name: "Add goal" }).click();
  await expect(dialog).toHaveCount(0);

  // The list links each title to its page.
  await page.getByRole("link", { name: "Learn Spanish" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Learn Spanish" }),
  ).toBeVisible();
  await expect(page).toHaveTitle("Goal · SoleUp");
  await expect(
    page.getByRole("definition").getByText("High priority"),
  ).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Why it matters" }),
  ).toContainText("To talk with my grandparents.");
  for (const section of ["Milestones", "Tasks"]) {
    await expect(
      page.getByRole("heading", { level: 2, name: section }),
    ).toBeVisible();
  }
  await expect(historySummaries(page)).toHaveText(["Created"]);
  await expectNoSeriousViolations(page);

  await changeStatus(page, "Pause", "Paused");
  await changeStatus(page, "Resume", "Resumed");
  await changeStatus(page, "Mark complete", "Marked complete");
  await expect(page.getByText(/Completed on /)).toBeVisible();
  await changeStatus(page, "Archive", "Archived");
  await changeStatus(page, "Restore to Active", "Restored from the archive");
  await changeStatus(page, "Drop", "Dropped");

  const expected = [
    "Dropped",
    "Restored from the archive",
    "Archived",
    "Marked complete",
    "Resumed",
    "Paused",
    "Created",
  ];
  await expect(historySummaries(page)).toHaveText(expected);
  const history = page.getByRole("region", { name: "History" });
  await expect(history.getByText("Archived → Active")).toBeVisible();
  await expect(history.getByText("Completed → Archived")).toBeVisible();
  // The reason is content: it never appears in the history.
  await expect(history).not.toContainText("grandparents");

  await page.reload();
  await expect(historySummaries(page)).toHaveText(expected);
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();

  // Back goes to the filter the goal is listed under.
  await page.getByRole("link", { name: "← Goals" }).click();
  await expect(
    page
      .getByRole("navigation", { name: "Filter goals by status" })
      .getByRole("link", { name: /^Dropped/ }),
  ).toHaveAttribute("aria-current", "page");
});

test("an unknown goal shows not-found inside the shell", async ({ page }) => {
  await signInAndConfirm(page);

  for (const path of [
    "/goals/not-a-goal",
    "/goals/00000000-0000-4000-8000-000000000000",
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { level: 1, name: "Goal not found" }),
    ).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toBeVisible();
  }
});
