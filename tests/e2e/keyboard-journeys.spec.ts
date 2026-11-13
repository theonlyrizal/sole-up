import { expect, test, type Locator, type Page } from "@playwright/test";

import { signInForTest } from "./helpers";

// Exercise the four primary journeys in docs/PRODUCT_SPEC.md. Only the
// test session is set up directly. Every journey action uses the keyboard.
async function tabTo(page: Page, target: Locator) {
  await expect(target).toBeVisible();
  for (let tabs = 0; tabs < 80; tabs += 1) {
    if (
      await target.evaluate((element) => element === document.activeElement)
    ) {
      break;
    }
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused({ timeout: 500 });
}

async function activate(page: Page, target: Locator, key = "Enter") {
  await tabTo(page, target);
  await page.keyboard.press(key);
}

async function typeInto(page: Page, target: Locator, text: string) {
  await tabTo(page, target);
  await page.keyboard.type(text);
}

function navLink(page: Page, name: string) {
  return page
    .getByRole("navigation", { name: "Main", exact: true })
    .getByRole("link", { name, exact: true });
}

async function openPlanPage(page: Page, name: "Today" | "Inbox") {
  const link = navLink(page, name);
  if (!(await link.isVisible())) await activate(page, navLink(page, "Plan"));
  await activate(page, link);
}

async function addGoal(
  page: Page,
  title: string,
  reason: string,
  area?: string,
) {
  await activate(page, navLink(page, "Goals"));
  await activate(page, page.getByRole("button", { name: "New goal" }).first());
  const dialog = page.getByRole("dialog", { name: "New goal" });
  await expect(dialog.getByLabel("Title")).toBeFocused();
  await page.keyboard.type(title);
  await typeInto(page, dialog.getByLabel("Why does this matter?"), reason);
  if (area) {
    const picker = dialog.getByLabel("Life area");
    await tabTo(page, picker);
    await page.keyboard.press("ArrowDown");
    await expect(picker.locator("option:checked")).toHaveText(area);
  }
  await activate(page, dialog.getByRole("button", { name: "Add goal" }));
  await expect(dialog).toBeHidden();
}

async function captureTask(page: Page, title: string) {
  const create = page.getByRole("button", { name: "Create", exact: true });
  await activate(page, create);
  await expect(page.getByRole("menuitem", { name: "New task" })).toBeFocused();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Add task" });
  await expect(dialog.getByLabel("Title")).toBeFocused();
  await page.keyboard.type(title);
  await page.keyboard.press("Enter");
  await expect(dialog).toBeHidden();
  await expect(create).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  test.slow();
  await signInForTest(page);
  await page.goto("/home");
  await activate(
    page,
    page.getByRole("button", { name: "Confirm and continue" }),
  );
  await expect(
    page.getByRole("heading", { level: 1, name: "Home", exact: true }),
  ).toBeVisible();
});

test("keyboard journey A turns an ambition into a plan", async ({ page }) => {
  const goal = "Run a half marathon";
  const reason = "Have more energy for my family.";
  const milestone = "Run 10 km";
  const task = "Plan a running route";

  await activate(page, navLink(page, "Goals"));
  await activate(page, page.getByRole("link", { name: "Life areas" }));
  await activate(page, page.getByRole("button", { name: "No thanks" }));
  await typeInto(
    page,
    page.getByRole("textbox", { name: "New area" }),
    "Health",
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("region", { name: "Active", exact: true }),
  ).toContainText("Health");

  await addGoal(page, goal, reason, "Health");
  await activate(
    page,
    page
      .getByRole("region", { name: "Health", exact: true })
      .getByRole("link", { name: goal }),
  );
  await expect(
    page.getByRole("region", { name: "Why it matters" }),
  ).toContainText(reason);

  await typeInto(
    page,
    page.getByRole("textbox", { name: "New milestone" }),
    milestone,
  );
  await page.keyboard.press("Enter");
  await expect(page.getByRole("checkbox", { name: milestone })).toBeVisible();
  await activate(
    page,
    page.getByRole("button", { name: `Add a task to ${milestone}` }),
  );
  await typeInto(
    page,
    page.getByRole("textbox", { name: `New task under ${milestone}` }),
    task,
  );
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("list", { name: `Tasks under ${milestone}` }),
  ).toContainText(task);

  await openPlanPage(page, "Today");
  await activate(page, page.getByRole("button", { name: "Add to today" }));
  const picker = page.getByRole("dialog", { name: "Add to today" });
  await expect(
    picker
      .getByRole("group", { name: goal })
      .getByRole("checkbox", { name: task }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(picker).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Add to today" }),
  ).toBeFocused();

  await page.keyboard.press("Enter");
  await activate(page, picker.getByRole("checkbox", { name: task }), "Space");
  await activate(page, picker.getByRole("button", { name: "Add to today" }));
  await expect(picker).toBeHidden();
  await activate(
    page,
    page
      .getByRole("region", { name: "Planned for today" })
      .getByRole("link", { name: goal }),
  );
  await expect(page.getByRole("region", { name: "Next action" })).toContainText(
    task,
  );
  await activate(page, navLink(page, "Home"));
  await expect(
    page.getByText("Every active goal has a next action."),
  ).toBeVisible();
});

test("keyboard journey B plans and adjusts the day", async ({ page }) => {
  const firstTask = "Call the bank";
  const secondTask = "Renew my library card";
  await captureTask(page, firstTask);
  await captureTask(page, secondTask);

  await openPlanPage(page, "Inbox");
  const inbox = page.getByRole("list", { name: "Inbox tasks" });
  for (const name of [firstTask, secondTask]) {
    const checkbox = inbox.getByRole("checkbox", { name });
    await activate(page, checkbox, "Space");
    await expect(checkbox).toBeChecked();
  }
  await activate(
    page,
    page
      .getByRole("group", { name: "Selected tasks" })
      .getByRole("button", { name: "Plan for today" }),
  );
  await expect(
    page.getByText("2 tasks planned for today", { exact: true }),
  ).toBeVisible();

  await openPlanPage(page, "Today");
  await expect(
    page.getByRole("region", { name: "Schedule", exact: true }),
  ).toBeVisible();
  await activate(
    page,
    page.getByRole("button", { name: `Move to tomorrow: ${secondTask}` }),
  );
  await expect(
    page.getByText("Moved to tomorrow", { exact: true }),
  ).toBeVisible();
  await activate(
    page,
    page.getByRole("checkbox", { name: `Complete ${firstTask}` }),
    "Space",
  );
  await expect(page.getByText("Task completed", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nothing planned for today" }),
  ).toBeVisible();

  await activate(page, navLink(page, "Plan"));
  await activate(
    page,
    page.getByRole("checkbox", { name: "Show completed and cancelled" }),
    "Space",
  );
  await expect(
    page.getByRole("checkbox", { name: `Complete: ${firstTask}` }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: `Complete: ${secondTask}` }),
  ).not.toBeChecked();
});

test("keyboard journey C creates, logs, corrects and pauses a habit", async ({
  page,
}) => {
  const habit = "Stretch";
  await activate(page, navLink(page, "Track"));
  await activate(page, page.getByRole("button", { name: "New habit" }).first());
  const dialog = page.getByRole("dialog", { name: "New habit" });
  await expect(dialog.getByLabel("Title")).toBeFocused();
  await page.keyboard.type(habit);
  await expect(dialog.getByRole("radio", { name: "Every day" })).toBeChecked();
  await activate(page, dialog.getByRole("button", { name: "Add habit" }));
  await expect(dialog).toBeHidden();

  await openPlanPage(page, "Today");
  await activate(
    page,
    page.getByRole("button", { name: `Done: ${habit}` }),
    "Space",
  );
  await expect(page.getByText("Marked done", { exact: true })).toBeVisible();
  await activate(page, navLink(page, "Track"));
  await expect(
    page.getByText("Last 4 weeks: 1 of 1 day", { exact: true }),
  ).toBeVisible();
  const logged = page.getByRole("button", { name: /: Done$/ });
  await activate(page, logged);
  const logDialog = page.getByRole("dialog");
  const done = logDialog.getByRole("radio", { name: "Done", exact: true });
  await expect(done).toBeChecked();
  await tabTo(page, done);
  await page.keyboard.press("ArrowDown");
  await expect(logDialog.getByRole("radio", { name: "Skipped" })).toBeChecked();
  await activate(page, logDialog.getByRole("button", { name: "Save" }));
  await expect(logDialog).toBeHidden();
  await expect(page.getByRole("button", { name: /: Skipped$/ })).toBeFocused();
  await expect(
    page.getByText("Last 4 weeks: Nothing expected in this range", {
      exact: true,
    }),
  ).toBeVisible();

  await activate(page, page.getByRole("button", { name: `Pause: ${habit}` }));
  await expect(
    page
      .getByRole("region", { name: "Paused" })
      .getByRole("button", { name: `Resume: ${habit}` }),
  ).toBeVisible();
});

test("keyboard journey D reflects, adjusts and finishes the weekly review", async ({
  page,
}) => {
  const goal = "Write a short story";
  const reflection = "Made time to write before work.";
  await addGoal(page, goal, "Make time for fiction.");
  await activate(page, navLink(page, "Review"));
  await expect(
    page.getByRole("list", { name: "Summary of the week" }),
  ).toBeVisible();

  await activate(page, page.getByRole("button", { name: "Next: Reflect" }));
  await expect(
    page.getByRole("heading", { name: "Reflect", exact: true }),
  ).toBeFocused();
  await typeInto(page, page.getByLabel("Wins"), reflection);
  await activate(page, page.getByRole("button", { name: "Next: Adjust" }));
  await expect(
    page.getByRole("heading", { name: "Adjust", exact: true }),
  ).toBeFocused();
  await activate(page, page.getByRole("button", { name: `Pause: ${goal}` }));
  await expect(
    page.getByRole("button", { name: `Resume: ${goal}` }),
  ).toBeVisible();

  await activate(
    page,
    page.getByRole("button", { name: "Next: Choose priorities" }),
  );
  await expect(
    page.getByRole("heading", { name: "Choose priorities", exact: true }),
  ).toBeFocused();
  const form = page.getByRole("form", { name: "Add a priority" });
  const picker = form.getByLabel("Goal or task");
  await tabTo(page, picker);
  await page.keyboard.press("ArrowDown");
  await expect(picker.locator("option:checked")).toHaveText(`${goal} (paused)`);
  await activate(page, form.getByRole("button", { name: "Add", exact: true }));
  await expect(
    page.getByRole("list", { name: "Priorities for next week" }),
  ).toContainText(goal);
  await activate(page, page.getByRole("button", { name: "Finish review" }));
  await expect(
    page.getByRole("region", { name: "Reviewed week" }),
  ).toContainText("Finished on");

  await activate(
    page,
    page
      .getByRole("navigation", { name: "Review steps" })
      .getByRole("link", { name: /Reflect/ }),
  );
  await expect(page.getByLabel("Wins")).toHaveValue(reflection);
});
