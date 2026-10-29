import { expect, test, type Locator, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// Linking notes to goals and tasks (chunk 8.3): from goal detail, the task
// dialog and the note editor; "New note" linked on its first save; goal
// and task delete keeping linked notes.

const goalNotes = (page: Page) =>
  page.getByRole("region", { name: "Notes", exact: true });

const tasksSection = (page: Page) =>
  page.getByRole("region", { name: "Tasks", exact: true });

const noteLinks = (page: Page) =>
  page.getByRole("region", { name: "Linked to" });

function saveStatus(page: Page) {
  return page
    .getByRole("status")
    .filter({ hasText: /^(Saving…|Saved|Not saved)$/ });
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
  return page.url();
}

async function addTask(page: Page, title: string) {
  const input = tasksSection(page).getByRole("textbox", { name: "New task" });
  await input.fill(title);
  await input.press("Enter");
  await expect(
    tasksSection(page).getByText(title, { exact: true }),
  ).toBeVisible();
}

async function createNote(page: Page, title: string, text: string) {
  await page.goto("/notes/new");
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page.getByRole("textbox", { name: "Note" }).click();
  await page.keyboard.type(text);
  await expect(saveStatus(page)).toHaveText("Saved");
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  return page.url();
}

async function openTaskDialog(page: Page, title: string) {
  await tasksSection(page)
    .getByRole("button", { name: `Edit: ${title}` })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit task" });
  await expect(dialog).toBeVisible();
  return dialog;
}

/** "Link a note" in a goal's or task's notes, then closes the picker. */
async function linkNoteFrom(
  scope: Locator,
  page: Page,
  search: string,
  title: string,
) {
  await scope.getByRole("button", { name: "Link a note" }).click();
  const picker = page.getByRole("dialog", { name: "Link a note" });
  await picker.getByRole("searchbox", { name: "Search notes" }).fill(search);
  await picker.getByRole("button", { name: `Link ${title}` }).click();
  await expect(picker.getByText("Linked", { exact: true })).toBeVisible();
  await expectNoSeriousViolations(page);
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
}

test("a note linked from a goal and a task shows on both, unlinks, and outlives the goal", async ({
  page,
}) => {
  // A journey across two notes, the goal page, the task dialog and back.
  test.slow();
  await signInAndConfirm(page);
  const noteUrl = await createNote(page, "Practice log", "Scales first.");
  await createNote(page, "Shopping", "Strings.");
  const goalUrl = await createGoalAndOpen(page, "Learn the cello");
  await addTask(page, "Buy rosin");

  // From the goal.
  await expect(goalNotes(page)).toContainText("No notes linked yet.");
  await linkNoteFrom(goalNotes(page), page, "practice", "Practice log");
  const goalList = goalNotes(page).getByRole("list", { name: "Linked notes" });
  await expect(
    goalList.getByRole("link", { name: "Practice log" }),
  ).toBeVisible();
  await expect(goalList.getByRole("link", { name: "Shopping" })).toHaveCount(0);
  await expectNoSeriousViolations(page);

  // From the task dialog. Only notes not linked to the task yet are offered.
  const dialog = await openTaskDialog(page, "Buy rosin");
  const taskNotes = dialog.getByRole("region", { name: "Linked notes" });
  await expect(taskNotes).toContainText("No notes linked yet.");
  await linkNoteFrom(taskNotes, page, "log", "Practice log");
  await expect(dialog).toBeVisible();
  await expect(
    taskNotes.getByRole("link", { name: "Practice log" }),
  ).toBeVisible();
  await expectNoSeriousViolations(page);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);

  // The note lists both, with their status.
  await page.goto(noteUrl);
  const links = noteLinks(page).getByRole("list", {
    name: "Linked goals and tasks",
  });
  await expect(links.getByRole("listitem")).toHaveCount(2);
  await expect(links.getByRole("listitem").first()).toContainText(
    "Learn the cello",
  );
  await expect(links.getByRole("listitem").first()).toContainText(
    "Goal · Active",
  );
  await expect(links.getByRole("listitem").last()).toContainText("Buy rosin");
  await expect(links.getByRole("listitem").last()).toContainText("Task · Open");
  await expectNoSeriousViolations(page);

  // Unlink the task from the note.
  await noteLinks(page)
    .getByRole("button", { name: "Unlink Buy rosin" })
    .click();
  await expect(links.getByRole("listitem")).toHaveCount(1);
  await page.goto(goalUrl);
  const reopened = await openTaskDialog(page, "Buy rosin");
  await expect(
    reopened.getByRole("region", { name: "Linked notes" }),
  ).toContainText("No notes linked yet.");
  await page.keyboard.press("Escape");

  // The goal's delete confirmation says the note is kept; it is.
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const confirm = page.getByRole("alertdialog", {
    name: "Delete “Learn the cello”?",
  });
  await expect(confirm).toContainText(
    "1 linked note will be kept, only unlinked.",
  );
  await confirm.getByRole("button", { name: "Delete goal" }).click();
  await expect(page).toHaveURL(/\/goals$/);

  await page.goto("/notes");
  await page.getByRole("link", { name: "Practice log" }).click();
  await expect(noteLinks(page)).toContainText(
    "Not linked to any goals or tasks yet.",
  );
  await expect(page.getByRole("textbox", { name: "Note" })).toContainText(
    "Scales first.",
  );
});

test("the editor links goals and tasks of any status from its picker", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await createGoalAndOpen(page, "Run a marathon");
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(
    page.getByRole("definition").getByText("Paused", { exact: true }),
  ).toBeVisible();
  await addTask(page, "Marathon shoes");
  await createNote(page, "Race plan", "Easy weeks.");

  await noteLinks(page)
    .getByRole("button", { name: "Link a goal or task" })
    .click();
  const picker = page.getByRole("dialog", { name: "Link a goal or task" });
  await picker
    .getByRole("searchbox", { name: "Search goals and tasks" })
    .fill("MARATHON");
  const goals = picker.getByRole("region", { name: "Goals" });
  const tasks = picker.getByRole("region", { name: "Tasks" });
  await expect(goals).toContainText("Paused");
  await goals.getByRole("button", { name: "Link Run a marathon" }).click();
  await expect(goals.getByText("Linked", { exact: true })).toBeVisible();
  await tasks.getByRole("button", { name: "Link Marathon shoes" }).click();
  await expect(tasks.getByText("Linked", { exact: true })).toBeVisible();
  await picker.getByRole("searchbox").fill("nothing like it");
  await expect(goals).toContainText("No goals match.");
  await expectNoSeriousViolations(page);
  await page.keyboard.press("Escape");

  const links = noteLinks(page).getByRole("list", {
    name: "Linked goals and tasks",
  });
  await expect(links.getByRole("listitem")).toHaveCount(2);
  await expect(links).toContainText("Goal · Paused");
  // Links don't change the note, so the editor stays saved.
  await expect(saveStatus(page)).toHaveText("Saved");

  // A goal link opens the goal, whose Notes list the note.
  await links.getByRole("link", { name: "Run a marathon" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Run a marathon" }),
  ).toBeVisible();
  await expect(
    goalNotes(page).getByRole("link", { name: "Race plan" }),
  ).toBeVisible();
});

test("New note from a task links it on its first save, and the task delete keeps it", async ({
  page,
}) => {
  // A journey across the goal page, the editor and the notes list.
  test.slow();
  await signInAndConfirm(page);
  const goalUrl = await createGoalAndOpen(page, "Fix the bike");
  await addTask(page, "Order brake pads");

  const dialog = await openTaskDialog(page, "Order brake pads");
  await dialog.getByRole("link", { name: "New note" }).click();
  await expect(page).toHaveURL(/\/notes\/new\?task=[0-9a-f-]{36}$/);
  await expect(noteLinks(page)).toContainText("Order brake pads");
  await expect(noteLinks(page)).toContainText(
    "Linked once the note has a title or some text.",
  );
  await expectNoSeriousViolations(page);

  await page.getByRole("textbox", { name: "Title" }).fill("Pad sizes");
  await expect(saveStatus(page)).toHaveText("Saved");
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await expect(
    noteLinks(page).getByRole("button", { name: "Unlink Order brake pads" }),
  ).toBeVisible();

  await page.goto(goalUrl);
  const reopened = await openTaskDialog(page, "Order brake pads");
  const taskNotes = reopened.getByRole("region", { name: "Linked notes" });
  await expect(
    taskNotes.getByRole("link", { name: "Pad sizes" }),
  ).toBeVisible();

  await reopened.getByRole("button", { name: "Delete task" }).click();
  const confirm = page.getByRole("alertdialog", {
    name: "Delete “Order brake pads”?",
  });
  await expect(confirm).toContainText(
    "1 linked note will be kept, only unlinked.",
  );
  await expect(confirm).toContainText("cancel it instead");
  await expectNoSeriousViolations(page);
  await confirm.getByRole("button", { name: "Delete task" }).click();
  // The confirmation hides the page behind it from the accessibility tree,
  // so wait for it to close before checking what's behind it.
  await expect(confirm).toHaveCount(0);
  await expect(page.getByText("Task deleted", { exact: true })).toBeVisible();
  await expect(reopened).toHaveCount(0);
  await expect(
    tasksSection(page).getByText("Order brake pads", { exact: true }),
  ).toHaveCount(0);

  await page.goto("/notes");
  await page.getByRole("link", { name: "Pad sizes" }).click();
  await expect(noteLinks(page)).toContainText(
    "Not linked to any goals or tasks yet.",
  );
});
