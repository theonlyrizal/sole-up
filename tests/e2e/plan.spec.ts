import { expect, test, type Page } from "@playwright/test";

import {
  chooseTaskAction,
  expectNoSeriousViolations,
  openQuickAdd,
  signInAndConfirm,
} from "./helpers";

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
  return names.map((name) => name.replace(/^Complete /, ""));
}

async function addTask(page: Page, title: string) {
  const dialog = page.getByRole("dialog", { name: "Add task" });
  // The button only opens the dialog once the page hydrates; retry until then.
  await expect(async () => {
    if (!(await dialog.isVisible())) {
      await openQuickAdd(page);
    }
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await dialog.getByLabel("Task title").fill(title);
  await dialog.getByLabel("Task title").press("Enter");
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
  const chip = filters(page).getByRole("button", { name: label, exact: true });
  const sheet = page.getByRole("dialog", { name: label, exact: true });
  await expect(async () => {
    if (!(await sheet.isVisible())) await chip.click();
    await expect(sheet).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await sheet.getByRole("radio", { name: option, exact: true }).click();
  await sheet.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(url);
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
    page.getByRole("heading", { level: 1, name: "All tasks" }),
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
    .getByRole("button", { name: title, exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit task" });
  await dialog.getByRole("radio", { name: priority, exact: true }).click();
  await dialog.getByLabel("Estimate (minutes)", { exact: true }).fill(estimate);
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
      taskList(page).getByRole("checkbox", { name: `Complete ${title}` }),
    ).toBeVisible();
  }

  await setPriorityAndEstimate(page, "Stretch", "High", "90");
  await expect(
    taskList(page).getByRole("img", { name: "High priority" }),
  ).toBeVisible();
  await expect(taskList(page).getByText("1 h 30 min")).toBeVisible();
  await setPriorityAndEstimate(page, "Call the bank", "Low", "45");
  await expect(taskList(page).getByText("45 min")).toBeVisible();

  // Put one task under the goal, inline.
  await chooseTaskAction(page, "Buy running shoes", "Dates and goal");
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
  await chooseFilter(page, "Sort", "Priority", /\/plan\?sort=priority$/);
  await expect
    .poll(() => listedTitles(page))
    .toEqual(["Stretch", "Call the bank", "Buy running shoes"]);

  // Filter by the goal.
  await chooseFilter(page, "Goal", "Run a 10k", /goal=[0-9a-f-]{36}/);
  await chooseFilter(
    page,
    "Priority",
    "No priority",
    /\/plan\?goal=[0-9a-f-]{36}&priority=none&sort=priority$/,
  );
  await expect.poll(() => listedTitles(page)).toEqual(["Buy running shoes"]);
  await expect(page.getByText("1 task", { exact: true })).toBeVisible();

  // Survives a reload: the same view comes back from the URL alone.
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(
    filters(page).getByRole("button", { name: "Remove Goal: Run a 10k" }),
  ).toBeVisible();
  await expect(
    filters(page).getByRole("button", { name: "Remove Priority: No priority" }),
  ).toBeVisible();
  await expect(
    filters(page).getByRole("button", { name: "Remove Sort: Priority" }),
  ).toBeVisible();
  await expect.poll(() => listedTitles(page)).toEqual(["Buy running shoes"]);

  // A priority filter that matches nothing, then clear everything.
  await filters(page)
    .getByRole("button", { name: "Remove Goal: Run a 10k" })
    .click();
  await expect(page).toHaveURL(/\/plan\?priority=none&sort=priority$/);
  await expect.poll(() => listedTitles(page)).toEqual(["Buy running shoes"]);
  await chooseFilter(page, "Priority", "Medium priority", /priority=medium/);
  await expect(
    page.getByRole("heading", { name: "No tasks match these filters" }),
  ).toBeVisible();
  await expectNoSeriousViolations(page);
  await filters(page).getByRole("button", { name: "Clear filters" }).click();
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

  const trigger = await chooseTaskAction(
    page,
    "Renew passport",
    "Dates and goal",
  );
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

  await chooseTaskAction(page, "Renew passport", "Dates and goal");
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
  await chooseTaskAction(page, "Renew passport", "Dates and goal");
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
    name: "Complete Water the plants",
  });
  await complete.click();
  await expect(page.getByText("Task completed", { exact: true })).toBeVisible();
  await expect(complete).toHaveCount(0);

  await taskList(page)
    .getByRole("button", { name: "Old errand", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit task" });
  await expectNoSeriousViolations(page);
  await dialog.getByRole("button", { name: "Cancel task" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Task cancelled", { exact: true })).toBeVisible();
  await expect.poll(() => listedTitles(page)).toEqual(["Book a table"]);

  const showClosed = filters(page).getByRole("button", { name: "Show closed" });
  await showClosed.click();
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
  await expect(showClosed).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => listedTitles(page)).toEqual(["Old errand"]);

  // Reopen from the list; hiding closed tasks again drops the status filter.
  await chooseFilter(page, "Status", "Any status", /\/plan\?closed=1$/);
  await taskList(page)
    .getByRole("checkbox", { name: "Complete Water the plants" })
    .click();
  await expect(page.getByText("Task reopened", { exact: true })).toBeVisible();
  await showClosed.click();
  await expect(page).toHaveURL(/\/plan$/);
  await expect
    .poll(() => listedTitles(page))
    .toEqual(["Water the plants", "Book a table"]);
});

test("a rejected completion keeps the row and focus until a confirmed retry", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signInAndConfirm(page);
  await openPlan(page);
  await addTask(page, "Mail the renewal form");
  await addTask(page, "Pack the rain jacket");
  const first = taskList(page).getByRole("checkbox", {
    name: "Complete Mail the renewal form",
  });
  const next = taskList(page).getByRole("button", {
    name: "Pack the rain jacket",
    exact: true,
  });
  const requestHeld = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  let requests = 0;
  await page.route("**/plan", async (route) => {
    const request = route.request();
    if (request.method() !== "POST" || !request.headers()["next-action"])
      return route.continue();
    requests++;
    requestHeld.resolve();
    await release.promise;
    const [input] = request.postDataJSON() as [{ id: string; status: string }];
    await route.continue({
      postData: JSON.stringify([{ ...input, status: "invalid" }]),
    });
  });
  await first.press("Space");
  try {
    await requestHeld.promise;
    await expect(first).toHaveAttribute("aria-busy", "true");
    await expect(first).toBeFocused();
    await expect(first).not.toBeChecked();
    await expect(page.getByText("Task completed", { exact: true })).toHaveCount(
      0,
    );
    await first.press("Space");
  } finally {
    release.resolve();
  }
  await expect(taskList(page).getByRole("alert")).toBeVisible();
  await expect(first).not.toBeChecked();
  await expect(first).toBeFocused();
  expect(requests).toBe(1);
  await page.unroute("**/plan");
  await first.press("Space");
  await expect(page.getByText("Task completed", { exact: true })).toBeVisible();
  await expect(first).toHaveCount(0);
  await expect(next).toBeFocused();

  await filters(page)
    .getByRole("button", { name: "Show closed" })
    .press("Space");
  await expect(first).toBeChecked();
  await page.reload();
  await expect(first).toBeChecked();
  await expect(page.getByText("Task completed", { exact: true })).toHaveCount(
    0,
  );
  await first.press("Space");
  await expect(first).not.toBeChecked();
  await expect(first).toBeFocused();
  await expect(page.getByText("Task reopened", { exact: true })).toBeVisible();
});

test("a failed detail save keeps its draft when the task moves out of the filter", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await openPlan(page);
  await addTask(page, "Draft the agenda");
  await chooseFilter(page, "Planned", "Not planned", /\/plan\?planned=none$/);
  await taskList(page)
    .getByRole("button", { name: "Draft the agenda", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit task" });
  const title = dialog.getByLabel("Title", { exact: true });
  const plan = dialog.getByLabel("Planned date");
  await title.fill(" ");
  await plan.fill("2030-03-12");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(
    dialog.getByText(
      "Dates and goal were saved. Review the remaining fields and save again.",
    ),
  ).toBeVisible();
  await expect(title).toHaveAttribute("aria-invalid", "true");
  await expect(title).toBeFocused();
  await expect(title).toHaveValue(" ");
  await expect(plan).toHaveValue("2030-03-12");
  await expect(page.getByText("Task saved", { exact: true })).toHaveCount(0);

  await title.fill("Draft the meeting agenda");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Task saved", { exact: true })).toBeVisible();
  await expect(page.getByText("0 tasks", { exact: true })).toBeFocused();
  await page.goto("/plan");
  const row = taskList(page)
    .getByRole("listitem")
    .filter({ hasText: "Draft the meeting agenda" });
  await expect(row).toContainText("Planned Mar 12, 2030");
});
