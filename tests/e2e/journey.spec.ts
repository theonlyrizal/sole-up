import { expect, test, type Page } from "@playwright/test";

import { signInAndConfirm } from "./helpers";

// The Phase 2 journey end to end (chunk 2.8): a life area, a goal with its
// reason, a milestone, two tasks, one planned for today and completed there.
// Today then shows the day as done, and the goal's progress (milestone-based,
// ADR 0010) is unchanged by the task.

const AREA = "Health";
const GOAL = "Run a half marathon";
const REASON = "I want to feel strong and have energy for my kids.";
const MILESTONE = "Run 10 km without stopping";
const MILESTONE_TASK = "Plan a running route";
const DIRECT_TASK = "Buy running shoes";

const tasksSection = (page: Page) =>
  page.getByRole("region", { name: "Tasks", exact: true });
const milestonesSection = (page: Page) =>
  page.getByRole("region", { name: "Milestones" });
const plannedToday = (page: Page) =>
  page.getByRole("region", { name: "Planned for today" });

async function openToday(page: Page) {
  await page.goto("/plan/today");
  await expect(
    page.getByRole("heading", { level: 1, name: "Today" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Planned for today" }),
  ).toBeVisible();
}

async function openGoal(page: Page) {
  await page.goto("/goals");
  await page.getByRole("link", { name: GOAL }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: GOAL }),
  ).toBeVisible();
}

/** The goal's progress, status and milestone as the journey leaves them. */
async function expectGoalProgressUnchanged(page: Page) {
  await expect(
    milestonesSection(page).getByText("0 of 1 milestone", { exact: true }),
  ).toBeVisible();
  await expect(
    milestonesSection(page).getByRole("checkbox", { name: MILESTONE }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("definition").getByText("Active", { exact: true }),
  ).toBeVisible();
}

test("area → goal → milestone → tasks → plan today → complete", async ({
  page,
}) => {
  // One long journey across five pages; more than the default 30 s under
  // parallel load on the dev server.
  test.slow();
  await signInAndConfirm(page);

  // A life area, created inline after declining the starters.
  await page.getByRole("link", { name: "Goals" }).click();
  await page.getByRole("link", { name: "Life areas" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Life areas" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "No thanks" }).click();
  const newArea = page.getByLabel("New area");
  await newArea.fill(AREA);
  await newArea.press("Enter");
  await expect(
    page.getByRole("region", { name: "Active" }).getByText(AREA, {
      exact: true,
    }),
  ).toBeVisible();

  // A goal in that area, with its reason.
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).first().click();
  const goalDialog = page.getByRole("dialog", { name: "New goal" });
  await goalDialog.getByLabel("Title").fill(GOAL);
  await goalDialog.getByLabel("Why does this matter?").fill(REASON);
  await goalDialog.getByLabel("Life area").selectOption({ label: AREA });
  await goalDialog.getByRole("button", { name: "Add goal" }).click();
  await expect(goalDialog).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: AREA }).getByRole("link", { name: GOAL }),
  ).toBeVisible();

  await openGoal(page);
  await expect(
    page.getByRole("region", { name: "Why it matters" }).getByText(REASON),
  ).toBeVisible();

  // A milestone.
  const newMilestone = milestonesSection(page).getByRole("textbox", {
    name: "New milestone",
  });
  await newMilestone.fill(MILESTONE);
  await newMilestone.press("Enter");
  await expect(
    milestonesSection(page).getByText("0 of 1 milestone", { exact: true }),
  ).toBeVisible();

  // Two tasks: one under the milestone, one directly under the goal.
  await tasksSection(page)
    .getByRole("button", { name: `Add a task to ${MILESTONE}` })
    .click();
  const underMilestone = tasksSection(page).getByRole("textbox", {
    name: `New task under ${MILESTONE}`,
  });
  await underMilestone.fill(MILESTONE_TASK);
  await underMilestone.press("Enter");
  await expect(
    tasksSection(page)
      .getByRole("list", { name: `Tasks under ${MILESTONE}` })
      .getByText(MILESTONE_TASK, { exact: true }),
  ).toBeVisible();
  await underMilestone.press("Escape");

  const direct = tasksSection(page).getByRole("textbox", { name: "New task" });
  await direct.fill(DIRECT_TASK);
  await direct.press("Enter");
  await expect(
    tasksSection(page)
      .getByRole("list", { name: "Tasks directly under this goal" })
      .getByText(DIRECT_TASK, { exact: true }),
  ).toBeVisible();

  // Plan the milestone's task for today from the Add to today picker.
  await openToday(page);
  await expect(
    page.getByRole("heading", { level: 3, name: "Nothing planned for today" }),
  ).toBeVisible();
  const picker = page.getByRole("dialog", { name: "Add to today" });
  // The button only opens the dialog once the page hydrates; retry until then.
  await expect(async () => {
    if (!(await picker.isVisible())) {
      await page.getByRole("button", { name: "Add to today" }).click();
    }
    await expect(picker).toBeVisible({ timeout: 1_000 });
  }).toPass();
  const goalGroup = picker.getByRole("group", { name: GOAL });
  await expect(goalGroup.getByRole("checkbox")).toHaveCount(2);
  await goalGroup.getByLabel(MILESTONE_TASK).check();
  await picker.getByRole("button", { name: "Add to today" }).click();
  await expect(picker).toHaveCount(0);
  await expect(
    page.getByText("1 task planned for today", { exact: true }),
  ).toBeVisible();
  await expect(plannedToday(page).getByRole("listitem")).toHaveCount(1);
  await expect(
    plannedToday(page).getByText(MILESTONE_TASK, { exact: true }),
  ).toBeVisible();

  // Complete it on Today: the day is clear again, and stays clear.
  await plannedToday(page)
    .getByRole("checkbox", { name: `Complete: ${MILESTONE_TASK}` })
    .click();
  await expect(page.getByText("Task completed", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 3, name: "Nothing planned for today" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { level: 3, name: "Nothing planned for today" }),
  ).toBeVisible();
  // The other task was never planned, so Today has only its first section.
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "Planned for today",
  ]);
  await expect(page.getByText(DIRECT_TASK, { exact: true })).toHaveCount(0);

  // The goal: progress, status and milestone unchanged by the task.
  await openGoal(page);
  await expectGoalProgressUnchanged(page);
  const milestoneList = tasksSection(page).getByRole("list", {
    name: `Tasks under ${MILESTONE}`,
  });
  // The completed task is kept, behind the toggle; the other is still open.
  await expect(
    tasksSection(page).getByText(MILESTONE_TASK, { exact: true }),
  ).toHaveCount(0);
  await expect(
    tasksSection(page).getByText(DIRECT_TASK, { exact: true }),
  ).toBeVisible();
  await tasksSection(page)
    .getByRole("checkbox", { name: "Show completed and cancelled (1)" })
    .click();
  await expect(
    milestoneList.getByText(MILESTONE_TASK, { exact: true }),
  ).toBeVisible();
  await expect(
    milestoneList.getByText("Completed", { exact: true }),
  ).toBeVisible();

  // The Goals list shows the same progress, still under its area.
  await page.goto("/goals");
  const goalRow = page
    .getByRole("region", { name: AREA })
    .getByRole("listitem")
    .filter({ has: page.getByRole("link", { name: GOAL }) });
  await expect(goalRow).toContainText("0 of 1 milestone");
});
