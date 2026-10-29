import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// Search (chunk 8.4): notes, goal titles and task titles from the shell's
// field and the search page, with stemming, highlights rendered as text,
// archived notes left out, and terms kept out of every URL.

const NOTHING_TO_SEARCH = /There was nothing to search for/;

function saveStatus(page: Page) {
  return page
    .getByRole("status")
    .filter({ hasText: /^(Saving…|Saved|Not saved)$/ });
}

const group = (page: Page, name: "Notes" | "Goals" | "Tasks") =>
  page.getByRole("region", { name, exact: true });

const pageSearchbox = (page: Page) =>
  page.getByRole("searchbox", { name: "Search for" });

async function createNote(page: Page, title: string, text: string) {
  await page.goto("/notes/new");
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page.getByRole("textbox", { name: "Note" }).click();
  await page.keyboard.type(text);
  await expect(saveStatus(page)).toHaveText("Saved");
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
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

/** Every URL the page requests, to check no search term is in one. */
function recordRequestUrls(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  page.on("framenavigated", (frame) => urls.push(frame.url()));
  return urls;
}

test("searches a note, a goal and a task with highlights as text, from the shell and the page", async ({
  page,
}) => {
  test.slow();
  await signInAndConfirm(page);
  await createNote(page, "<b>Marathon</b> plan", "Started running again");
  await createNote(page, "Old log", "Running in the rain");
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await createGoal(page, "Run a marathon");
  await createTask(page, "Running shoes");
  await createTask(page, "Pay the rent");

  const urls = recordRequestUrls(page);

  // The shell's field opens the search page with the terms in memory.
  await page.goto("/home");
  const shellField = page.getByRole("searchbox", {
    name: "Search notes, goals and tasks",
  });
  await shellField.fill("runs");
  await shellField.press("Enter");
  await expect(page).toHaveURL(/\/notes\/search$/);
  await expect(pageSearchbox(page)).toHaveValue("runs");
  await expect(
    page.getByRole("status").filter({ hasText: /^Found/ }),
  ).toHaveText("Found 1 note, 1 goal, 1 task.");

  // Stemming: "runs" finds "running" and "Run". The archived note is out.
  const note = group(page, "Notes").getByRole("link");
  await expect(note).toHaveText(["<b>Marathon</b> plan"]);
  await expect(group(page, "Notes").locator("mark")).toHaveText(["running"]);
  await expect(group(page, "Notes")).toContainText("Started running again");
  await expect(group(page, "Notes")).not.toContainText("Old log");
  await expect(group(page, "Goals").getByRole("link")).toHaveText([
    "Run a marathon",
  ]);
  await expect(group(page, "Goals").locator("mark")).toHaveText(["Run"]);
  await expect(group(page, "Goals")).toContainText("Active");
  await expect(group(page, "Tasks").getByRole("button")).toHaveText([
    "Running shoes",
  ]);
  await expect(group(page, "Tasks")).toContainText("Open");
  // Stored markup is text: no <b> element came from the title.
  await expect(group(page, "Notes").locator("b")).toHaveCount(0);
  await expectNoSeriousViolations(page);

  // A task opens its dialog in place; closing it searches again.
  await group(page, "Tasks")
    .getByRole("button", { name: "Running shoes" })
    .click();
  const dialog = page.getByRole("dialog", { name: "Edit task" });
  await expect(dialog.getByLabel("Title")).toHaveValue("Running shoes");
  await expectNoSeriousViolations(page);
  await dialog.getByRole("button", { name: "Close" }).first().click();
  await expect(dialog).toHaveCount(0);
  await expect(
    group(page, "Tasks").getByRole("button", { name: "Running shoes" }),
  ).toBeFocused();

  // With the keyboard alone, on the page: a new search, then a result.
  await pageSearchbox(page).focus();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type("rent");
  await page.keyboard.press("Enter");
  await expect(group(page, "Tasks").getByRole("button")).toHaveText([
    "Pay the rent",
  ]);
  await expect(group(page, "Notes")).toContainText("No notes matched.");
  await expect(group(page, "Goals")).toContainText("No goals matched.");

  // Only stop words: nothing to search for. Nothing matching: no matches.
  await pageSearchbox(page).fill("the and of");
  await pageSearchbox(page).press("Enter");
  await expect(page.getByText(NOTHING_TO_SEARCH)).toBeVisible();
  await pageSearchbox(page).fill("spaceship");
  await pageSearchbox(page).press("Enter");
  await expect(
    page.getByRole("heading", { level: 2, name: "No matches" }),
  ).toBeVisible();
  await pageSearchbox(page).fill("   ");
  await pageSearchbox(page).press("Enter");
  await expect(
    page.getByRole("alert").filter({ hasText: "Type something" }),
  ).toHaveText("Type something to search for.");
  await expect(pageSearchbox(page)).toBeFocused();
  await expectNoSeriousViolations(page);

  // A note result opens the note.
  await pageSearchbox(page).fill("marathon");
  await pageSearchbox(page).press("Enter");
  await group(page, "Notes")
    .getByRole("link", { name: "<b>Marathon</b> plan" })
    .click();
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(
    "<b>Marathon</b> plan",
  );

  // No term was ever in a URL.
  for (const term of ["runs", "rent", "spaceship", "marathon"]) {
    for (const url of urls) {
      expect(new URL(url).search.toLowerCase()).not.toContain(term);
      expect(new URL(url).hash.toLowerCase()).not.toContain(term);
    }
  }
  expect(urls.some((url) => new URL(url).pathname === "/notes/search")).toBe(
    true,
  );
});

test("search finds only the signed-in user's notes, goals and tasks", async ({
  page,
  browser,
}) => {
  test.slow();
  await signInAndConfirm(page, "Ada Lovelace");
  await createNote(page, "Engine notes", "Analytical engine sketches");
  await createGoal(page, "Build the engine");
  await createTask(page, "Order engine parts");

  // Another user, in their own browser context, finds none of it.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signInAndConfirm(other, "Charles Babbage");
  await other.goto("/notes/search");
  await pageSearchbox(other).fill("engine");
  await pageSearchbox(other).press("Enter");
  await expect(
    other.getByRole("heading", { level: 2, name: "No matches" }),
  ).toBeVisible();
  await otherContext.close();

  // The owner finds all three.
  await page.goto("/notes/search");
  await pageSearchbox(page).fill("engine");
  await pageSearchbox(page).press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: /^Found/ }),
  ).toHaveText("Found 1 note, 1 goal, 1 task.");
});
