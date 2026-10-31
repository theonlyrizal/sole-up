import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";
import { auditEventsOf } from "./test-database";

// Tags (chunk 8.5): tag a note inline from the editor, filter the Notes
// list and search's notes group by the tag, rename it and delete it from
// the Tags manager. Tag names never reach a URL or the audit log, and
// another user sees none of them.

function saveStatus(page: Page) {
  return page
    .getByRole("status")
    .filter({ hasText: /^(Saving…|Saved|Not saved)$/ });
}

async function createNote(page: Page, title: string, text: string) {
  await page.goto("/notes/new");
  await expect(page.getByText("then tag it")).toBeVisible();
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page.getByRole("textbox", { name: "Note" }).click();
  await page.keyboard.type(text);
  await expect(saveStatus(page)).toHaveText("Saved");
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
}

const tagsSection = (page: Page) =>
  page.getByRole("region", { name: "Tags", exact: true });

async function addTag(page: Page, name: string) {
  const field = tagsSection(page).getByRole("combobox", { name: "Add a tag" });
  await field.fill(name);
  await field.press("Enter");
  await expect(field).toHaveValue("");
}

const noteTagList = (page: Page) =>
  tagsSection(page).getByRole("list", { name: "Tags on this note" });

/** The note's tag chips, by name (each also holds a hidden "×"). */
async function expectNoteTags(page: Page, names: string[]) {
  const chips = noteTagList(page).getByRole("listitem");
  await expect(chips).toHaveText(names.map((name) => `${name}×`));
}

/** Every URL the page requests, to check no tag name is in one. */
function recordRequestUrls(page: Page): string[] {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  page.on("framenavigated", (frame) => urls.push(frame.url()));
  return urls;
}

test("tags a note, filters by the tag, renames it and deletes it", async ({
  page,
  browser,
}) => {
  test.slow();
  const userId = await signInAndConfirm(page);
  const urls = recordRequestUrls(page);

  // Tag a note inline: a new tag is created as it's added.
  await createNote(page, "Interval plan", "Hill sprints on Tuesday");
  await expectNoSeriousViolations(page);
  await addTag(page, "Zucchini");
  await addTag(page, "Lavender");
  await expectNoteTags(page, ["Lavender", "Zucchini"]);
  // The same name in another case is the same tag: nothing is added.
  await addTag(page, "zucchini");
  await expect(noteTagList(page).getByRole("listitem")).toHaveCount(2);
  // Remove one, by keyboard.
  await tagsSection(page)
    .getByRole("button", { name: "Remove tag Lavender" })
    .press("Enter");
  await expectNoteTags(page, ["Zucchini"]);
  // Tags don't change the note's text, so nothing is waiting to save.
  await expect(saveStatus(page)).toHaveText("Saved");

  // A second note reuses the tag, typed in another case.
  await createNote(page, "Grocery list", "Hill of beans");
  await addTag(page, "ZUCCHINI");
  await expectNoteTags(page, ["Zucchini"]);
  await createNote(page, "Untagged note", "Hill walking");

  // The list shows each note's tags; filter by one.
  await page.goto("/notes");
  const list = page.getByRole("list", { name: "Notes", exact: true });
  await expect(list.getByRole("heading")).toHaveCount(3);
  await page.getByLabel("Tag", { exact: true }).selectOption("Zucchini");
  await page.getByRole("button", { name: "Show" }).click();
  await expect(page).toHaveURL(/\/notes\?tag=[0-9a-f-]{36}$/);
  const tagId = new URL(page.url()).searchParams.get("tag")!;
  await expect(page.getByText("Showing notes tagged")).toContainText(
    "Zucchini",
  );
  await expect(list.getByRole("heading")).toHaveText([
    "Grocery list",
    "Interval plan",
  ]);
  await expectNoSeriousViolations(page);
  await page.getByRole("link", { name: "Show all notes" }).click();
  await expect(list.getByRole("heading")).toHaveCount(3);
  // A tag chip opens the filtered list too.
  await list.getByRole("link", { name: "Zucchini" }).first().click();
  await expect(page).toHaveURL(`/notes?tag=${tagId}`);
  await expect(list.getByRole("heading")).toHaveCount(2);

  // Search's notes group filters by the tag; goals and tasks are untouched.
  await page.goto("/notes/search");
  const field = page.getByRole("searchbox", { name: "Search for" });
  await field.fill("hill");
  await field.press("Enter");
  const notesGroup = page.getByRole("region", { name: "Notes", exact: true });
  await expect(notesGroup.getByRole("listitem")).toHaveCount(3);
  await page.getByLabel("Notes with tag").selectOption("Zucchini");
  await expect(notesGroup.getByRole("listitem")).toHaveCount(2);
  await expect(notesGroup.getByRole("listitem")).not.toContainText([
    "Untagged note",
  ]);
  await expectNoSeriousViolations(page);

  // Rename from the Tags manager; a taken name is refused.
  await page.goto("/notes");
  await page.getByRole("link", { name: "Tags", exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/tags$/);
  const tagRows = page.getByRole("list", { name: "Tags" });
  await expect(tagRows.getByRole("listitem")).toHaveCount(2);
  await expect(tagRows.getByRole("listitem").nth(1)).toContainText(
    "On 2 notes",
  );
  await expectNoSeriousViolations(page);
  await page.getByRole("button", { name: "Rename Zucchini" }).click();
  const nameField = page.getByRole("textbox", { name: "Tag name" });
  await expect(nameField).toBeFocused();
  await nameField.fill("lavender");
  await nameField.press("Enter");
  await expect(tagRows.getByRole("alert")).toHaveText(
    "You already have a tag with that name.",
  );
  await expect(nameField).toHaveAttribute("aria-invalid", "true");
  await nameField.fill("Courgette");
  await nameField.press("Enter");
  await expect(
    page.getByRole("button", { name: "Rename Courgette" }),
  ).toBeFocused();
  await expect(tagRows).toContainText("Courgette");

  // The filtered list shows the new name.
  await page.goto(`/notes?tag=${tagId}`);
  await expect(page.getByText("Showing notes tagged")).toContainText(
    "Courgette",
  );

  // Another user sees none of it, even with the tag's ID.
  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await signInAndConfirm(other, "Grace Hopper");
  await other.goto(`/notes?tag=${tagId}`);
  await expect(
    other.getByText("That tag doesn't exist any more"),
  ).toBeVisible();
  await expect(other.getByText("No notes yet")).toBeVisible();
  await other.goto("/notes/tags");
  await expect(other.getByText("No tags yet")).toBeVisible();
  await otherContext.close();

  // Delete, confirmed with the number of notes, which are only untagged.
  await page.goto("/notes/tags");
  await page.getByRole("button", { name: "Delete Courgette" }).click();
  const confirm = page.getByRole("alertdialog", {
    name: "Delete the tag “Courgette”?",
  });
  await expect(confirm).toContainText("It's on 2 notes.");
  await expect(confirm).toContainText("kept, only untagged");
  await expectNoSeriousViolations(page);
  await confirm.getByRole("button", { name: "Delete tag" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(tagRows.getByRole("listitem")).toHaveText([/Lavender/]);

  await page.goto("/notes");
  await expect(list.getByRole("heading")).toHaveCount(3);
  await expect(list.getByRole("link", { name: "Courgette" })).toHaveCount(0);
  await page.goto(`/notes?tag=${tagId}`);
  await expect(page.getByText("That tag doesn't exist any more")).toBeVisible();

  // No tag name in any requested URL or in the audit log.
  const audit = JSON.stringify(await auditEventsOf(userId)).toLowerCase();
  expect(audit).toContain("note.tags_changed");
  for (const name of ["zucchini", "lavender", "courgette"]) {
    expect(audit).not.toContain(name);
    expect(urls.filter((url) => url.toLowerCase().includes(name))).toEqual([]);
  }
});

test("an archived note shows its tags read-only", async ({ page }) => {
  await signInAndConfirm(page);
  await createNote(page, "Old plan", "Kept for later");
  await addTag(page, "Archive me");
  await expectNoteTags(page, ["Archive me"]);
  await page.getByRole("button", { name: "Archive", exact: true }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await page.goto("/notes/archived");
  await page.getByRole("link", { name: "Old plan" }).click();
  const article = page.getByRole("list", { name: "Tags on this note" });
  await expect(article).toHaveText("Archive me");
  await expect(page.getByRole("combobox", { name: "Add a tag" })).toHaveCount(
    0,
  );
  await expectNoSeriousViolations(page);
});
