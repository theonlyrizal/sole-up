import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// The weekly review flow (chunk 7.3): opened from the navigation on last
// week, four steps that save as they are left, adjustments through the
// ordinary goal and task actions, and "Finish review" with nothing filled.

const PAUSED_GOAL = "Learn Spanish";
const PRIORITY_GOAL = "Write a novel";
const FIRST_TASK = "Book a tutor";
const SECOND_TASK = "Draft chapter one";
const PRIORITY_TASK = "Buy notebooks";

function toastSaying(page: Page, title: string) {
  return page
    .getByRole("region", { name: /^Notifications/ })
    .getByRole("listitem")
    .filter({ hasText: title });
}

function stepsNav(page: Page) {
  return page.getByRole("navigation", { name: "Review steps" });
}

function reviewedWeek(page: Page) {
  return page.getByRole("region", { name: "Reviewed week" });
}

async function expectStep(page: Page, label: string) {
  await expect(
    page.getByRole("heading", { level: 2, name: label }),
  ).toBeVisible();
  await expect(
    stepsNav(page).getByRole("link", { name: label }),
  ).toHaveAttribute("aria-current", "step");
}

async function createGoal(page: Page, title: string) {
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New goal" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Add goal" }).click();
  await expect(dialog).toHaveCount(0);
}

async function createTask(page: Page, title: string) {
  await page.getByRole("button", { name: "Add task" }).click();
  const dialog = page.getByRole("dialog", { name: "Add task" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Title").press("Enter");
  await expect(dialog).toHaveCount(0);
}

async function openReview(page: Page) {
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Review" })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Weekly review" }),
  ).toBeVisible();
  await expectStep(page, "Look back");
}

test("a review pauses a goal, plans two tasks for next week and sets priorities", async ({
  page,
}) => {
  test.slow();
  await signInAndConfirm(page);
  await createGoal(page, PAUSED_GOAL);
  await createGoal(page, PRIORITY_GOAL);
  for (const title of [FIRST_TASK, SECOND_TASK, PRIORITY_TASK]) {
    await createTask(page, title);
  }

  // The flow opens on last week, with this week offered instead.
  await openReview(page);
  await expect(reviewedWeek(page)).toContainText("Last week:");
  await expect(reviewedWeek(page)).toContainText("Not finished");
  await expect(
    reviewedWeek(page).getByRole("link", { name: /^Review this week instead/ }),
  ).toBeVisible();

  // Look back: each figure with its definition.
  const summary = page.getByRole("list", { name: "Summary of the week" });
  await expect(
    summary.getByRole("heading", { name: "Tasks completed" }),
  ).toBeVisible();
  await expect(summary).toContainText(
    "Tasks marked completed during this week",
  );
  await expect(summary.getByRole("heading")).toHaveCount(6);
  await expectNoSeriousViolations(page);

  // Reflect: saved on leaving the step.
  await page.getByRole("button", { name: "Next: Reflect" }).click();
  await expectStep(page, "Reflect");
  await page.getByLabel("Wins").fill("Kept practising every morning.");
  await expectNoSeriousViolations(page);
  await page.getByRole("button", { name: "Next: Adjust" }).click();
  await expectStep(page, "Adjust");

  // Adjust: pause a goal with the ordinary goal action.
  const goals = page.getByRole("list", { name: "Active and paused goals" });
  await goals.getByRole("button", { name: `Pause: ${PAUSED_GOAL}` }).click();
  await expect(toastSaying(page, "Paused.").first()).toBeVisible();
  await expect(
    goals.getByRole("button", { name: `Resume: ${PAUSED_GOAL}` }),
  ).toBeVisible();

  // Plan two tasks on days of the week after the reviewed one.
  const planForm = page.getByRole("form", {
    name: "Plan a task for next week",
  });
  const planned = page.getByRole("list", { name: "Planned for next week" });
  const days = await planForm.getByLabel("Day").locator("option").all();
  const lastDay = (await days.at(-1)!.getAttribute("value"))!;
  await planForm.getByLabel("Task").selectOption({ label: FIRST_TASK });
  await planForm.getByRole("button", { name: "Plan" }).click();
  await expect(planned.getByText(FIRST_TASK)).toBeVisible();
  await planForm.getByLabel("Task").selectOption({ label: SECOND_TASK });
  await planForm.getByLabel("Day").selectOption(lastDay);
  await planForm.getByRole("button", { name: "Plan" }).click();
  await expect(planned.getByText(SECOND_TASK)).toBeVisible();
  await expect(planned.getByRole("listitem")).toHaveCount(2);
  // A planned task is no longer offered.
  await expect(
    planForm.getByLabel("Task").locator("option", { hasText: FIRST_TASK }),
  ).toHaveCount(0);
  await page.mouse.move(0, 0);
  await expectNoSeriousViolations(page);

  // Choose priorities: a goal and a task, reordered, with a note.
  await page.getByRole("button", { name: "Next: Choose priorities" }).click();
  await expectStep(page, "Choose priorities");
  const addForm = page.getByRole("form", { name: "Add a priority" });
  await addForm
    .getByLabel("Goal or task")
    .selectOption({ label: PRIORITY_GOAL });
  await addForm.getByRole("button", { name: "Add" }).click();
  await addForm
    .getByLabel("Goal or task")
    .selectOption({ label: PRIORITY_TASK });
  await addForm.getByRole("button", { name: "Add" }).click();
  const priorities = page.getByRole("list", {
    name: "Priorities for next week",
  });
  await priorities
    .getByRole("button", { name: `Move up: ${PRIORITY_TASK}` })
    .click();
  await expect(priorities.getByRole("listitem")).toHaveText([
    new RegExp(PRIORITY_TASK),
    new RegExp(PRIORITY_GOAL),
  ]);
  // Focus stays with the moved row.
  await expect(
    priorities.getByRole("button", { name: `Move down: ${PRIORITY_TASK}` }),
  ).toBeFocused();
  await page.getByLabel("Note (optional)").fill("Mornings first.");
  await expectNoSeriousViolations(page);

  await page.getByRole("button", { name: "Finish review" }).click();
  await expect(toastSaying(page, "Review finished").first()).toBeVisible();
  await expect(reviewedWeek(page)).toContainText("Finished on");

  // Everything was saved: reload and walk back through the steps.
  await page.reload();
  await expectStep(page, "Choose priorities");
  await expect(priorities.getByRole("listitem")).toHaveText([
    new RegExp(PRIORITY_TASK),
    new RegExp(PRIORITY_GOAL),
  ]);
  await expect(page.getByLabel("Note (optional)")).toHaveValue(
    "Mornings first.",
  );
  await stepsNav(page).getByRole("link", { name: "Reflect" }).click();
  await expectStep(page, "Reflect");
  await expect(page.getByLabel("Wins")).toHaveValue(
    "Kept practising every morning.",
  );
  await stepsNav(page).getByRole("link", { name: "Adjust" }).click();
  await expectStep(page, "Adjust");
  await expect(planned.getByRole("listitem")).toHaveCount(2);

  // The adjustments are ordinary changes, seen everywhere.
  await page.goto("/goals?status=paused");
  await expect(page.getByRole("link", { name: PAUSED_GOAL })).toBeVisible();

  // Last week is finished, so the flow now opens on this week.
  await openReview(page);
  await expect(reviewedWeek(page)).toContainText("This week:");
  await expect(
    reviewedWeek(page).getByRole("link", { name: /^Review last week instead/ }),
  ).toBeVisible();
});

test("a review with nothing filled can be finished, with the keyboard alone", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await openReview(page);

  // Step links work from the keyboard, and focus moves to the new step.
  const priorities = stepsNav(page).getByRole("link", {
    name: "Choose priorities",
  });
  await priorities.focus();
  await page.keyboard.press("Enter");
  await expectStep(page, "Choose priorities");
  await expect(
    page.getByRole("heading", { level: 2, name: "Choose priorities" }),
  ).toBeFocused();
  await expect(page.getByText("None chosen yet.")).toBeVisible();

  const finish = page.getByRole("button", { name: "Finish review" });
  await finish.focus();
  await page.keyboard.press("Enter");
  await expect(toastSaying(page, "Review finished").first()).toBeVisible();
  await expect(reviewedWeek(page)).toContainText("Finished on");
  // A finished review stays editable while its week is open.
  await expect(page.getByRole("button", { name: "Save review" })).toBeVisible();
  await expectNoSeriousViolations(page);
});
