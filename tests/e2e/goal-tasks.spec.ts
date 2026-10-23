import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// Tasks on goal detail, the next action, and deleting a goal moving its
// tasks to the inbox (chunk 2.7).

const tasksSection = (page: Page) =>
  page.getByRole("region", { name: "Tasks", exact: true });

const nextAction = (page: Page) =>
  tasksSection(page).getByRole("region", { name: "Next action" });

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

async function addMilestone(page: Page, title: string) {
  const milestones = page.getByRole("region", { name: "Milestones" });
  const input = milestones.getByRole("textbox", { name: "New milestone" });
  await input.fill(title);
  await input.press("Enter");
  await expect(milestones.getByText(title, { exact: true })).toBeVisible();
}

test("tasks on goal detail: add in context, next action, survives a reload", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await createGoalAndOpen(page, "Learn the cello");
  await addMilestone(page, "Rent a cello");
  await expect(nextAction(page)).toContainText("Add a task for the next step");

  // A task directly under the goal: one field and Enter.
  const direct = tasksSection(page).getByRole("textbox", { name: "New task" });
  await direct.fill("Buy rosin");
  await direct.press("Enter");
  const directList = tasksSection(page).getByRole("list", {
    name: "Tasks directly under this goal",
  });
  await expect(
    directList.getByText("Buy rosin", { exact: true }),
  ).toBeVisible();
  await expect(direct).toHaveValue("");

  // A task under the milestone, from its own "Add task" button.
  const addToMilestone = tasksSection(page).getByRole("button", {
    name: "Add a task to Rent a cello",
  });
  await addToMilestone.click();
  const underMilestone = tasksSection(page).getByRole("textbox", {
    name: "New task under Rent a cello",
  });
  await expect(underMilestone).toBeFocused();
  await underMilestone.fill("Call the music shop");
  await underMilestone.press("Enter");
  const milestoneList = tasksSection(page).getByRole("list", {
    name: "Tasks under Rent a cello",
  });
  await expect(
    milestoneList.getByText("Call the music shop", { exact: true }),
  ).toBeVisible();
  // Escape closes the form and puts focus back on its button.
  await underMilestone.press("Escape");
  await expect(underMilestone).toHaveCount(0);
  await expect(addToMilestone).toBeFocused();

  // Neither task has a date yet, so there is no next action.
  await expect(nextAction(page)).toContainText(
    "Plan one of the tasks below, or give it a due date",
  );
  await expectNoSeriousViolations(page);

  // A due date makes the milestone's task the next action.
  await milestoneList
    .getByRole("button", { name: "Dates and goal: Call the music shop" })
    .click();
  const editor = page.getByRole("form", {
    name: "Dates and goal for Call the music shop",
  });
  await editor.getByLabel("Due date").fill("2026-11-05");
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toHaveCount(0);
  await expect(nextAction(page)).toContainText("Call the music shop");
  await expect(nextAction(page)).toContainText("Under Rent a cello");

  // Completing a task never touches the milestone or goal (ADR 0010).
  await directList
    .getByRole("checkbox", { name: "Complete: Buy rosin" })
    .click();
  await expect(directList.getByText("Buy rosin", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    page
      .getByRole("region", { name: "Milestones" })
      .getByRole("checkbox", { name: "Rent a cello" }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("definition").getByText("Active", { exact: true }),
  ).toBeVisible();

  // The completed task is behind the toggle, and everything survives a reload.
  await page.reload();
  await expect(nextAction(page)).toContainText("Call the music shop");
  await tasksSection(page)
    .getByRole("checkbox", { name: "Show completed and cancelled (1)" })
    .click();
  await expect(
    directList.getByText("Buy rosin", { exact: true }),
  ).toBeVisible();
  await expect(
    directList.getByText("Completed", { exact: true }),
  ).toBeVisible();
});

test("deleting a goal states its task count and moves the tasks to the inbox", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await createGoalAndOpen(page, "Run a marathon");
  await addMilestone(page, "Run 10 km");

  const direct = tasksSection(page).getByRole("textbox", { name: "New task" });
  await direct.fill("Buy running shoes");
  await direct.press("Enter");
  await expect(
    tasksSection(page).getByText("Buy running shoes", { exact: true }),
  ).toBeVisible();
  await tasksSection(page)
    .getByRole("button", { name: "Add a task to Run 10 km" })
    .click();
  const underMilestone = tasksSection(page).getByRole("textbox", {
    name: "New task under Run 10 km",
  });
  await underMilestone.fill("Find a running route");
  await underMilestone.press("Enter");
  await expect(
    tasksSection(page).getByText("Find a running route", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("alertdialog", {
    name: "Delete “Run a marathon”?",
  });
  await expect(confirm).toContainText(
    "1 milestone will be deleted. 2 tasks will move to your inbox.",
  );
  await expectNoSeriousViolations(page);
  await confirm.getByRole("button", { name: "Delete goal" }).click();
  await expect(page).toHaveURL(/\/goals$/);

  // Both tasks are kept, with no goal, in the inbox.
  await page.goto("/plan/inbox");
  await expect(
    page.getByRole("heading", { level: 1, name: "Inbox" }),
  ).toBeVisible();
  await expect(
    page.getByText("Buy running shoes", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Find a running route", { exact: true }),
  ).toBeVisible();
});
