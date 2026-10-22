import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// The Plan page (chunk 2.4): filters and sorts in the URL, inline edit of
// dates and parent, the edit form, and closed tasks behind a toggle.

function taskList(page: Page) {
  return page.getByRole("list", { name: "Tasks" });
}

function filters(page: Page) {
  return page.getByRole("region", { name: "Filter and sort tasks" });
}

/** The titles in the list, top to bottom. */
async function listedTitles(page: Page) {
  const boxes = taskList(page).getByRole("checkbox");
  const names = await boxes.evaluateAll((elements) =>
    elements.map((element) => element.getAttribute("aria-label") ?? ""),
  );
  return names.map((name) => name.replace(/^Complete: /, ""));
}

async function addTask(page: Page, title: string) {
  const dialog = page.getByRole("dialog", { name: "Add task" });
  // The button only opens the dialog once the page hydrates; retry until then.
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await page.getByRole("button", { name: "Add task" }).click();
    }
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByLabel("Title").press("Enter");
  await expect(dialog).toHaveCount(0);
}

/**
 * Picks a filter option and waits for the URL to show it. Retries, since a
 * choice made before the page hydrates (right after a reload) never reaches
 * React.
 */
async function chooseFilter(
  page: Page,
  label: string,
  option: string,
  url: RegExp,
) {
  const select = filters(page).getByLabel(label, { exact: true });
  await expect(async () => {
    await select.selectOption({ label: option });
    await expect(page).toHaveURL(url, { timeout: 1_000 });
  }).toPass();
}

async function createGoal(page: Page, title: string) {
  await page.goto("/goals");
  await page.getByRole("button", { name: "New goal" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New goal" });
  await dialog.getByLabel("Title").fill(title);
  await dialog.getByRole("button", { name: "Add goal" }).click();
  await expect(dialog).toHaveCount(0);
}

async function openPlan(page: Page) {
  await page.goto("/plan");
  await expect(
    page.getByRole("heading", { level: 1, name: "Plan" }),
  ).toBeVisible();
}

/** Edits title-independent fields through the edit dialog. */
async function setPriorityAndEstimate(
  page: Page,
  title: string,
  priority: string,
  estimate: string,
) {
  await taskList(page)
    .getByRole("button", { name: `Edit: ${title}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit task" });
  await dialog.getByLabel("Priority").selectOption({ label: priority });
  await dialog.getByLabel("Estimate (minutes)").fill(estimate);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
}

test("filters and sort live in the URL and survive a reload", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await createGoal(page, "Run a 10k");
  await openPlan(page);
  await expect(
    page.getByRole("heading", { name: "No open tasks" }),
  ).toBeVisible();

  for (const title of ["Call the bank", "Buy running shoes", "Stretch"]) {
    await addTask(page, title);
    await expect(
      taskList(page).getByRole("checkbox", { name: `Complete: ${title}` }),
    ).toBeVisible();
  }

  await setPriorityAndEstimate(page, "Stretch", "High", "90");
  await expect(taskList(page).getByText("High priority")).toBeVisible();
  await expect(taskList(page).getByText("1 h 30 min")).toBeVisible();
  await setPriorityAndEstimate(page, "Call the bank", "Low", "45");
  await expect(taskList(page).getByText("45 min")).toBeVisible();

  // Put one task under the goal, inline.
  await taskList(page)
    .getByRole("button", { name: "Dates and goal: Buy running shoes" })
    .click();
  const editor = page.getByRole("form", {
    name: "Dates and goal for Buy running shoes",
  });
  await editor
    .getByLabel("Goal or milestone")
    .selectOption({ label: "Run a 10k" });
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toHaveCount(0);
  await expect(
    taskList(page).getByRole("link", { name: "Run a 10k" }),
  ).toBeVisible();

  // Sort by priority: high, low, then none.
  await chooseFilter(page, "Sort by", "Priority", /\/plan\?sort=priority$/);
  await expect
    .poll(() => listedTitles(page))
    .toEqual(["Stretch", "Call the bank", "Buy running shoes"]);

  // Filter by the goal.
  await chooseFilter(page, "Goal", "Run a 10k", /goal=[0-9a-f-]{36}/);
  await expect.poll(() => listedTitles(page)).toEqual(["Buy running shoes"]);
  await expect(page.getByText("1 task", { exact: true })).toBeVisible();

  // Survives a reload: the same view comes back from the URL alone.
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(filters(page).getByLabel("Goal")).toHaveValue(/[0-9a-f-]{36}/);
  await expect(filters(page).getByLabel("Sort by")).toHaveValue("priority");
  await expect.poll(() => listedTitles(page)).toEqual(["Buy running shoes"]);

  // A priority filter that matches nothing, then clear everything.
  await chooseFilter(page, "Goal", "Any goal", /\/plan\?sort=priority$/);
  await chooseFilter(page, "Priority", "No priority", /priority=none/);
  await expect.poll(() => listedTitles(page)).toEqual(["Buy running shoes"]);
  await chooseFilter(page, "Priority", "Medium priority", /priority=medium/);
  await expect(
    page.getByRole("heading", { name: "No tasks match these filters" }),
  ).toBeVisible();
  await expectNoSeriousViolations(page);
  await filters(page).getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect.poll(() => listedTitles(page)).toHaveLength(3);
});

test("dates and parent are edited inline; date windows filter them", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await createGoal(page, "Learn Spanish");
  await openPlan(page);
  await addTask(page, "Renew passport");
  await addTask(page, "Buy a phrasebook");

  const trigger = taskList(page).getByRole("button", {
    name: "Dates and goal: Renew passport",
  });
  await trigger.click();
  const editor = page.getByRole("form", {
    name: "Dates and goal for Renew passport",
  });
  await expect(editor.getByLabel("Plan for")).toBeFocused();
  await expectNoSeriousViolations(page);

  // Escape closes it without saving and gives focus back.
  await editor.getByLabel("Plan for").fill("2030-01-15");
  await page.keyboard.press("Escape");
  await expect(editor).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(taskList(page).getByText(/Planned/)).toHaveCount(0);

  await trigger.click();
  await editor.getByLabel("Plan for").fill("2030-01-15");
  await editor.getByLabel("Due date").fill("2030-01-20");
  await editor.getByLabel("Due time").fill("17:30");
  await editor
    .getByLabel("Goal or milestone")
    .selectOption({ label: "Learn Spanish" });
  await editor.getByRole("button", { name: "Save" }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.getByText("Task updated", { exact: true })).toBeVisible();
  await expect(trigger).toBeFocused();
  const row = taskList(page).getByRole("listitem").filter({
    hasText: "Renew passport",
  });
  await expect(row.getByText(/Planned Jan 15, 2030/)).toBeVisible();
  await expect(row.getByText(/Due Jan 20, 2030, 5:30\s?PM/)).toBeVisible();
  await expect(row.getByRole("link", { name: "Learn Spanish" })).toBeVisible();

  // The editor reopens with the saved values.
  await trigger.click();
  await expect(editor.getByLabel("Due time")).toHaveValue("17:30");
  await editor.getByRole("button", { name: "Cancel" }).click();

  // Date windows.
  await chooseFilter(page, "Planned", "Later", /planned=later/);
  await expect.poll(() => listedTitles(page)).toEqual(["Renew passport"]);
  await chooseFilter(page, "Planned", "Not planned", /planned=none/);
  await expect.poll(() => listedTitles(page)).toEqual(["Buy a phrasebook"]);
  await chooseFilter(page, "Planned", "Any time", /\/plan$/);
  await chooseFilter(page, "Due", "No due date", /\/plan\?due=none$/);
  await expect.poll(() => listedTitles(page)).toEqual(["Buy a phrasebook"]);
  await page.reload();
  await expect.poll(() => listedTitles(page)).toEqual(["Buy a phrasebook"]);
});

test("completed and cancelled tasks appear behind a toggle", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await openPlan(page);
  await addTask(page, "Water the plants");
  await addTask(page, "Book a table");
  await addTask(page, "Old errand");

  const complete = taskList(page).getByRole("checkbox", {
    name: "Complete: Water the plants",
  });
  await complete.click();
  await expect(page.getByText("Task completed", { exact: true })).toBeVisible();
  await expect(complete).toHaveCount(0);

  await taskList(page)
    .getByRole("button", { name: "Edit: Old errand" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit task" });
  await expectNoSeriousViolations(page);
  await dialog.getByRole("button", { name: "Cancel task" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Task cancelled", { exact: true })).toBeVisible();
  await expect.poll(() => listedTitles(page)).toEqual(["Book a table"]);

  await filters(page).getByLabel("Show completed and cancelled").click();
  await expect(page).toHaveURL(/\/plan\?closed=1$/);
  await expect
    .poll(() => listedTitles(page))
    .toEqual(["Water the plants", "Book a table", "Old errand"]);
  await expect(
    taskList(page).getByText("Completed", { exact: true }),
  ).toBeVisible();
  await expect(
    taskList(page).getByText("Cancelled", { exact: true }),
  ).toBeVisible();

  await chooseFilter(page, "Status", "Cancelled", /closed=1&status=cancelled/);
  await expect.poll(() => listedTitles(page)).toEqual(["Old errand"]);
  await page.reload();
  await expect(
    filters(page).getByLabel("Show completed and cancelled"),
  ).toBeChecked();
  await expect.poll(() => listedTitles(page)).toEqual(["Old errand"]);

  // Reopen from the list; hiding closed tasks again drops the status filter.
  await chooseFilter(page, "Status", "Any status", /\/plan\?closed=1$/);
  await taskList(page)
    .getByRole("checkbox", { name: "Complete: Water the plants" })
    .click();
  await expect(page.getByText("Task reopened", { exact: true })).toBeVisible();
  await filters(page).getByLabel("Show completed and cancelled").click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect
    .poll(() => listedTitles(page))
    .toEqual(["Water the plants", "Book a table"]);
});
