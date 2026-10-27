import { expect, type Locator, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// Time blocks UI (chunk 4.8): "Block time" from a task, blocks on Week, Day
// and the Agenda, the block dialog's status actions and times, repeating
// blocks with a scope prompt and "End series here", and the pointer paths
// (slot select, drag to move, resize, drag from the task panel). The
// browser (and so the confirmed time zone) is in Tokyo.

const TOKYO = "Asia/Tokyo";
test.use({ timezoneId: TOKYO });

const DAY_MS = 24 * 60 * 60 * 1000;

/** The user's date `days` from today in Tokyo (no DST there). */
function tokyoDate(days = 0): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TOKYO }).format(
    new Date(Date.now() + days * DAY_MS),
  );
}

/** Quick add on the Plan page. */
async function addTask(page: Page, title: string) {
  await page.goto("/plan");
  const quickAdd = page.getByRole("dialog", { name: "Add task" });
  await expect(async () => {
    if (!(await quickAdd.isVisible())) {
      await page.getByRole("button", { name: "Add task" }).click();
    }
    await expect(quickAdd).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await quickAdd.getByLabel("Title").fill(title);
  await quickAdd.getByLabel("Title").press("Enter");
  await expect(quickAdd).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: `Block time: ${title}` }),
  ).toBeVisible();
}

/** Opens a dialog from its button, retrying until the page has hydrated. */
async function openDialog(page: Page, button: Locator, name: string) {
  const dialog = page.getByRole("dialog", { name });
  await expect(async () => {
    if (!(await dialog.isVisible())) await button.click();
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  return dialog;
}

async function openCalendar(page: Page, path: string) {
  await page.goto(path);
  await expect(
    page.getByRole("heading", { level: 1, name: "Calendar" }),
  ).toBeVisible();
  await expect(page.getByRole("grid")).toBeVisible();
}

/** An item's button, inside the grid cell of its local day. */
function item(page: Page, date: string, title: string) {
  return page
    .locator(`.soleup-calendar [role="gridcell"][data-date="${date}"]`)
    .getByRole("button", { name: title, exact: true });
}

/** The block element FullCalendar draws around an item's button. */
function blockOf(page: Page, date: string, title: string) {
  return page
    .locator(`.soleup-calendar [role="gridcell"][data-date="${date}"]`)
    .locator(".soleup-block", {
      has: page.getByRole("button", { name: title, exact: true }),
    });
}

/**
 * The middle of a day's timed column at the top of a slot ("HH:MM"),
 * scrolled into view (mouse positions are in the viewport), and a slot's
 * height.
 */
async function slotPoint(page: Page, date: string, time: string) {
  const slot = page.locator(`.soleup-calendar [data-time="${time}:00"]`).last();
  await slot.scrollIntoViewIfNeeded();
  const column = (await page
    .locator(`.soleup-calendar [role="gridcell"][data-date="${date}"]`)
    .last()
    .boundingBox())!;
  const lane = (await slot.boundingBox())!;
  return { x: column.x + column.width / 2, y: lane.y, slot: lane.height };
}

/** An element's box once it is scrolled into view. */
async function boxOf(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  return (await locator.boundingBox())!;
}

/** Drags with the mouse in small steps, as FullCalendar expects. */
async function drag(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x, from.y + 4, { steps: 2 });
  await page.mouse.move(to.x, to.y, { steps: 12 });
  await page.mouse.up();
}

/** The block dialog's status line. */
function statusOf(dialog: Locator) {
  return dialog
    .locator("dt", { hasText: "Status" })
    .locator("xpath=following-sibling::dd[1]");
}

test("blocks time for a task by form, and completing the task marks the block done", async ({
  page,
}) => {
  test.slow();
  await signInAndConfirm(page);
  const today = tokyoDate();
  await addTask(page, "Write report");

  // The estimate is the new block's default length.
  const edit = await openDialog(
    page,
    page.getByRole("button", { name: "Edit: Write report" }),
    "Edit task",
  );
  await edit.getByLabel("Estimate (minutes)").fill("45");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toHaveCount(0);
  // The form reads the estimate when it opens: wait for the refreshed row.
  await expect(
    page.getByRole("listitem").filter({ hasText: "Write report" }).last(),
  ).toContainText("45 min");

  const form = await openDialog(
    page,
    page.getByRole("button", { name: "Block time: Write report" }),
    "Block time",
  );
  await expect(form.getByLabel("Length (minutes)")).toHaveValue("45");
  await expect(
    form.getByText("Times are in your time zone, Asia/Tokyo."),
  ).toBeVisible();
  await expectNoSeriousViolations(page);
  // Started at midnight today, so completing the task marks it.
  await form.getByLabel("Date").fill(today);
  await form.getByLabel("Start time").fill("00:00");
  await form.getByRole("button", { name: "Block time" }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByText("Time blocked", { exact: true })).toBeVisible();

  // On Week, styled as a block and at its time.
  await openCalendar(page, "/plan/calendar?view=week");
  await expect(blockOf(page, today, "Write report")).toBeVisible();
  await expect(blockOf(page, today, "Write report")).toContainText(
    "12:00 AM – 12:45 AM",
  );
  await item(page, today, "Write report").click();
  let dialog = page.getByRole("dialog", { name: "Time block" });
  await expect(dialog).toBeVisible();
  await expect(statusOf(dialog)).toHaveText(/^(Scheduled|Not marked)$/);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // Complete the task on the Plan page.
  await page.goto("/plan");
  await page.getByRole("checkbox", { name: "Complete: Write report" }).click();
  await expect(page.getByText("Task completed", { exact: true })).toBeVisible();

  // The block is now done; marking never needs the task again.
  await openCalendar(page, "/plan/calendar?view=week");
  await item(page, today, "Write report").click();
  dialog = page.getByRole("dialog", { name: "Time block" });
  await expect(statusOf(dialog)).toHaveText("Done");
  await expect(
    dialog.getByText("Task completed", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Also complete the task" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(blockOf(page, today, "Write report")).toHaveClass(
    /soleup-block-done/,
  );

  // The Agenda lists it as a time block.
  await page.goto("/plan/calendar?days=7");
  const row = page
    .getByRole("listitem")
    .filter({
      has: page.getByRole("button", { name: "Write report", exact: true }),
    })
    .last();
  await expect(row).toContainText("Time block");
  await expect(row).toContainText("Done");
});

test("a block's dialog marks it, completes the task separately, and changes its times by keyboard", async ({
  page,
}) => {
  test.slow();
  await signInAndConfirm(page);
  const tomorrow = tokyoDate(1);
  await addTask(page, "Draft slides");

  // "Block time" on the grid asks for the task first.
  await openCalendar(page, `/plan/calendar?view=day&date=${tomorrow}`);
  const form = await openDialog(
    page,
    page.getByRole("button", { name: "Block time", exact: true }),
    "Block time",
  );
  await expect(form.getByLabel("Task")).toBeFocused();
  await form.getByLabel("Task").selectOption({ label: "Draft slides" });
  await expect(form.getByLabel("Length (minutes)")).toHaveValue("60");
  await form.getByLabel("Date").fill(tomorrow);
  await form.getByLabel("Start time").fill("10:00");
  await form.getByLabel("Start time").press("Enter");
  await expect(form).toHaveCount(0);
  await expect(blockOf(page, tomorrow, "Draft slides")).toContainText(
    "10:00 AM – 11:00 AM",
  );

  // Keyboard only: focus the item, Enter opens its dialog.
  await item(page, tomorrow, "Draft slides").focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Time block" });
  await expect(dialog).toBeVisible();
  await expect(statusOf(dialog)).toHaveText("Scheduled");
  const status = dialog.getByRole("group", { name: "Status" });
  await status.getByRole("button", { name: "Mark done" }).click();
  await expect(statusOf(dialog)).toHaveText("Done");
  // Marking a block never completes its task: that's a separate action.
  await expect(
    status.getByRole("button", { name: "Also complete the task" }),
  ).toBeVisible();
  await status.getByRole("button", { name: "Back to scheduled" }).click();
  await expect(statusOf(dialog)).toHaveText("Scheduled");
  await expect(
    status.getByRole("button", { name: "Also complete the task" }),
  ).toHaveCount(0);
  await status.getByRole("button", { name: "Mark skipped" }).click();
  await expect(statusOf(dialog)).toHaveText("Skipped");
  await expectNoSeriousViolations(page);

  // The form is the keyboard path for moving and resizing.
  await dialog.getByLabel("Start time").fill("11:00");
  await dialog.getByLabel("Length (minutes)").fill("90");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("Block saved", { exact: true })).toBeVisible();
  await expect(item(page, tomorrow, "Draft slides")).toBeFocused();
  await expect(blockOf(page, tomorrow, "Draft slides")).toContainText(
    "11:00 AM – 12:30 PM",
  );
  await expect(blockOf(page, tomorrow, "Draft slides")).toHaveClass(
    /soleup-block-skipped/,
  );

  // The task dialog lists its upcoming blocks.
  await page.goto("/plan");
  const task = await openDialog(
    page,
    page.getByRole("button", { name: "Edit: Draft slides" }),
    "Edit task",
  );
  const blocks = task.getByRole("list", { name: "Upcoming time blocks" });
  await expect(blocks.getByRole("listitem")).toHaveCount(1);
  await expect(blocks).toContainText("11:00 AM – 12:30 PM");
  await expect(blocks).toContainText("Skipped");
  await page.keyboard.press("Escape");

  // Deleting asks first and keeps the task.
  await openCalendar(page, `/plan/calendar?view=day&date=${tomorrow}`);
  await item(page, tomorrow, "Draft slides").click();
  await dialog.getByRole("button", { name: "Delete block" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete this block?" });
  await confirm.getByRole("button", { name: "Delete block" }).click();
  await expect(page.getByText("Block deleted", { exact: true })).toBeVisible();
  await expect(item(page, tomorrow, "Draft slides")).toHaveCount(0);
});

test("a repeating block asks for the scope when dragged, and a completed task's future occurrences can end the series", async ({
  page,
}) => {
  test.slow();
  await signInAndConfirm(page);
  const today = tokyoDate();
  const tomorrow = tokyoDate(1);
  const later = tokyoDate(2);
  await addTask(page, "Stretch");

  const form = await openDialog(
    page,
    page.getByRole("button", { name: "Block time: Stretch" }),
    "Block time",
  );
  await form.getByLabel("Date").fill(today);
  await form.getByLabel("Start time").fill("00:00");
  await form.getByLabel("Length (minutes)").fill("30");
  await form.getByLabel("Repeat", { exact: true }).selectOption("daily");
  await form.getByRole("radio", { name: "After a number of times" }).check();
  await form.getByRole("spinbutton", { name: "Number of times" }).fill("3");
  await form.getByRole("button", { name: "Block time" }).click();
  await expect(form).toHaveCount(0);

  // Dragging tomorrow's occurrence an hour later asks which blocks move.
  await openCalendar(page, `/plan/calendar?view=day&date=${tomorrow}`);
  const block = await boxOf(blockOf(page, tomorrow, "Stretch"));
  const { slot } = await slotPoint(page, tomorrow, "01:00");
  await drag(
    page,
    { x: block.x + block.width / 2, y: block.y + block.height / 2 },
    { x: block.x + block.width / 2, y: block.y + block.height / 2 + 2 * slot },
  );
  const scope = page.getByRole("dialog", { name: "Move block" });
  await expect(scope).toBeVisible();
  await expect(scope.getByRole("radio", { name: "This block" })).toBeChecked();
  await expect(scope.getByRole("radio", { name: "All blocks" })).toBeVisible();
  await expectNoSeriousViolations(page);
  await scope.getByRole("button", { name: "Save" }).click();
  await expect(scope).toHaveCount(0);
  await expect(page.getByText("Block saved", { exact: true })).toBeVisible();
  await page.reload();
  await expect(blockOf(page, tomorrow, "Stretch")).toContainText(
    "1:00 AM – 1:30 AM",
  );

  // Completing the task marks today's started occurrence only.
  await page.goto("/plan");
  await page.getByRole("checkbox", { name: "Complete: Stretch" }).click();
  await expect(page.getByText("Task completed", { exact: true })).toBeVisible();

  await openCalendar(page, `/plan/calendar?view=day&date=${today}`);
  await item(page, today, "Stretch").click();
  let dialog = page.getByRole("dialog", { name: "Time block" });
  await expect(statusOf(dialog)).toHaveText("Done");
  await expect(
    dialog.getByRole("button", { name: "End series here" }),
  ).toHaveCount(0);
  await page.keyboard.press("Escape");

  // A future occurrence offers to end the series there.
  await openCalendar(page, `/plan/calendar?view=day&date=${later}`);
  await item(page, later, "Stretch").click();
  dialog = page.getByRole("dialog", { name: "Time block" });
  await expect(statusOf(dialog)).toHaveText("Scheduled");
  await expect(
    dialog.getByText("Task completed", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("button", { name: "End series here" }).click();
  const confirm = page.getByRole("alertdialog", {
    name: "End the series here?",
  });
  await confirm.getByRole("button", { name: "End series" }).click();
  await expect(page.getByText("Series ended", { exact: true })).toBeVisible();
  await expect(item(page, later, "Stretch")).toHaveCount(0);

  // Earlier occurrences stay.
  await openCalendar(page, `/plan/calendar?view=day&date=${tomorrow}`);
  await expect(item(page, tomorrow, "Stretch")).toBeVisible();
});

test("blocks are made and changed with the pointer: slot select, move, resize and the task panel", async ({
  page,
}) => {
  test.slow();
  await signInAndConfirm(page);
  const today = tokyoDate();
  await addTask(page, "Read paper");

  // Selecting a slot opens the task picker at that time.
  await openCalendar(page, "/plan/calendar?view=day");
  const ten = await slotPoint(page, today, "10:00");
  await drag(
    page,
    { x: ten.x, y: ten.y + 2 },
    { x: ten.x, y: ten.y + ten.slot * 2 - 2 },
  );
  const form = page.getByRole("dialog", { name: "Block time" });
  await expect(form).toBeVisible();
  await expect(form.getByLabel("Start time")).toHaveValue("10:00");
  await expect(form.getByLabel("Length (minutes)")).toHaveValue("60");
  await form.getByLabel("Task").selectOption({ label: "Read paper" });
  // The selected length stays, rather than following the task.
  await expect(form.getByLabel("Length (minutes)")).toHaveValue("60");
  await form.getByRole("button", { name: "Block time" }).click();
  await expect(form).toHaveCount(0);
  await expect(blockOf(page, today, "Read paper")).toContainText(
    "10:00 AM – 11:00 AM",
  );

  // Drag the block an hour later.
  let box = await boxOf(blockOf(page, today, "Read paper"));
  await drag(
    page,
    { x: box.x + box.width / 2, y: box.y + box.height / 2 },
    { x: box.x + box.width / 2, y: box.y + box.height / 2 + ten.slot * 2 },
  );
  await expect(page.getByText("Block moved", { exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(blockOf(page, today, "Read paper")).toContainText(
    "11:00 AM – 12:00 PM",
  );

  // Drag its bottom edge half an hour down.
  box = await boxOf(blockOf(page, today, "Read paper"));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await drag(
    page,
    { x: box.x + box.width / 2, y: box.y + box.height - 2 },
    { x: box.x + box.width / 2, y: box.y + box.height - 2 + ten.slot },
  );
  await expect(
    page.getByText("Block length changed", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(blockOf(page, today, "Read paper")).toContainText(
    "11:00 AM – 12:30 PM",
  );

  // On a desktop Week, drag the task from the panel onto 14:00.
  await openCalendar(page, "/plan/calendar?view=week");
  const panel = page.getByRole("complementary", { name: "Open tasks" });
  const row = panel.getByRole("listitem").filter({ hasText: "Read paper" });
  await expect(
    row.getByRole("button", { name: "Block time: Read paper" }),
  ).toBeVisible();
  // The panel stays in view (sticky) while the grid scrolls to 14:00.
  const two = await slotPoint(page, today, "14:00");
  const from = (await row.locator("span").first().boundingBox())!;
  await drag(
    page,
    { x: from.x + 10, y: from.y + from.height / 2 },
    { x: two.x, y: two.y + 3 },
  );
  await expect(page.getByText("Time blocked", { exact: true })).toBeVisible();
  await page.reload();
  await expect(
    page
      .locator(
        `.soleup-calendar [role="gridcell"][data-date="${today}"] .soleup-block`,
      )
      .filter({ hasText: "2:00 PM – 3:00 PM" }),
  ).toBeVisible();
  await expectNoSeriousViolations(page);
});
