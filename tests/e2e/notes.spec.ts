import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

// Notes (chunk 8.2): the list, the TipTap editor limited to the 8.1
// allowlist, autosave with its indicator and conflict prompt, the
// read-only view, archive and delete.

function mainNav(page: Page) {
  return page.getByRole("navigation", { name: "Main" });
}

function noteBody(page: Page) {
  return page.getByRole("textbox", { name: "Note" });
}

function noteTitle(page: Page) {
  return page.getByRole("textbox", { name: "Title" });
}

function saveStatus(page: Page) {
  return page
    .getByRole("status")
    .filter({ hasText: /^(Saving…|Saved|Not saved)$/ });
}

async function expectSaved(page: Page) {
  await expect(saveStatus(page)).toHaveText("Saved");
}

/** Starts a new note with a title and a first line, and waits for it. */
async function createNote(page: Page, title: string, text: string) {
  await page.goto("/notes/new");
  await noteTitle(page).fill(title);
  await noteBody(page).click();
  await page.keyboard.type(text);
  await expectSaved(page);
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  return page.url();
}

/** Pastes `html` into the editor as the clipboard would deliver it. */
async function pasteHtml(page: Page, html: string, text = "") {
  await noteBody(page).evaluate(
    (element, data) => {
      const transfer = new DataTransfer();
      transfer.setData("text/html", data.html);
      transfer.setData("text/plain", data.text);
      element.dispatchEvent(
        new ClipboardEvent("paste", {
          clipboardData: transfer,
          bubbles: true,
          cancelable: true,
        }),
      );
    },
    { html, text },
  );
}

test("a note is written with every kind of formatting, saved and listed", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await page.goto("/notes");
  await expect(
    page.getByRole("heading", { level: 2, name: "No notes yet" }),
  ).toBeVisible();
  await expectNoSeriousViolations(page);

  // The empty state offers it as well as the page header.
  await expect(page.getByRole("link", { name: "New note" })).toHaveCount(2);
  await page.getByRole("link", { name: "New note" }).first().click();
  await expect(page).toHaveURL(/\/notes\/new$/);
  await expect(noteBody(page)).toBeVisible();
  // Nothing is stored for an empty note.
  await expect(saveStatus(page)).toHaveCount(0);

  await noteTitle(page).fill("Reading list");
  await noteBody(page).click();
  const toolbar = page.getByRole("group", { name: "Formatting" });
  await toolbar.getByRole("button", { name: "Heading 2" }).click();
  await page.keyboard.type("Books to read");
  await page.keyboard.press("Enter");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("Bold");
  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type(" then ");
  await toolbar.getByRole("button", { name: "Italic" }).click();
  await page.keyboard.type("italic");
  await toolbar.getByRole("button", { name: "Italic" }).click();
  await page.keyboard.type(" and ");
  await toolbar.getByRole("button", { name: "Strikethrough" }).click();
  await page.keyboard.type("struck");
  await toolbar.getByRole("button", { name: "Strikethrough" }).click();
  await page.keyboard.type(" and ");
  await toolbar.getByRole("button", { name: "Code", exact: true }).click();
  await page.keyboard.type("code");
  await toolbar.getByRole("button", { name: "Code", exact: true }).click();
  await page.keyboard.type(" ");

  // A link: anything but http:, https: and mailto: is refused.
  await toolbar.getByRole("button", { name: "Link" }).click();
  const linkDialog = page.getByRole("dialog", { name: "Add a link" });
  await linkDialog.getByLabel("Link address").fill("javascript:alert(1)");
  await linkDialog.getByRole("button", { name: "Add link" }).click();
  await expect(
    linkDialog.getByText(
      "Links must start with http://, https:// or mailto: and be up to 2,048 characters.",
    ),
  ).toBeVisible();
  await expectNoSeriousViolations(page);
  await linkDialog.getByLabel("Link address").fill("https://example.com/");
  await linkDialog.getByRole("button", { name: "Add link" }).click();
  await expect(linkDialog).toHaveCount(0);

  await page.keyboard.press("Enter");
  await toolbar.getByRole("button", { name: "Bulleted list" }).click();
  await page.keyboard.type("First");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Second");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await toolbar.getByRole("button", { name: "Numbered list" }).click();
  await page.keyboard.type("One");
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await toolbar.getByRole("button", { name: "Quote" }).click();
  await page.keyboard.type("Quoted");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("on two lines");
  await page.keyboard.press("Enter");
  await toolbar.getByRole("button", { name: "Quote" }).click();
  await toolbar.getByRole("button", { name: "Divider" }).click();
  await toolbar.getByRole("button", { name: "Code block" }).click();
  await page.keyboard.type("const answer = 42;");

  await expectSaved(page);
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await expect(page).toHaveTitle("Note · SoleUp");
  await expectNoSeriousViolations(page);

  // Everything came back from the server as it was written.
  await page.reload();
  const body = noteBody(page);
  await expect(noteTitle(page)).toHaveValue("Reading list");
  await expect(body.locator("h2")).toHaveText("Books to read");
  await expect(body.locator("strong")).toHaveText("Bold");
  await expect(body.locator("em")).toHaveText("italic");
  await expect(body.locator("s")).toHaveText("struck");
  await expect(body.locator("p > code")).toHaveText("code");
  await expect(body.locator('a[href="https://example.com/"]')).toHaveText(
    "https://example.com/",
  );
  await expect(body.locator("ul > li")).toHaveText(["First", "Second"]);
  await expect(body.locator("ol > li")).toHaveText(["One"]);
  await expect(body.locator("blockquote br")).toHaveCount(1);
  await expect(body.locator("hr")).toHaveCount(1);
  await expect(body.locator("pre")).toHaveText("const answer = 42;");
  await expectSaved(page);

  await mainNav(page).getByRole("link", { name: "Notes" }).click();
  const list = page.getByRole("list", { name: "Notes" });
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list.getByRole("link", { name: "Reading list" })).toBeVisible();
  await expect(list.getByText("Books to read")).toBeVisible();
  await expect(list.getByText(/^Updated /)).toBeVisible();
  await expectNoSeriousViolations(page);
});

test("a draft is not lost when leaving right after typing", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await page.goto("/notes/new");
  await noteBody(page).click();
  await page.keyboard.type("A thought worth keeping");
  // Leave at once, well before the autosave delay.
  await mainNav(page).getByRole("link", { name: "Notes" }).click();

  await expect(page).toHaveURL(/\/notes$/);
  const list = page.getByRole("list", { name: "Notes" });
  await expect(list.getByRole("link", { name: "Untitled" })).toBeVisible();
  await expect(list.getByText("A thought worth keeping")).toBeVisible();

  // An edit followed straight away by the back link is kept too.
  await list.getByRole("link", { name: "Untitled" }).click();
  await expect(noteBody(page)).toContainText("A thought worth keeping");
  await noteTitle(page).fill("Kept");
  await page.getByRole("link", { name: "← Notes" }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(list.getByRole("link", { name: "Kept" })).toBeVisible();
});

test("script never executes: pasted markup is stripped and stored markup renders as text", async ({
  page,
}) => {
  const dialogs: string[] = [];
  page.on("dialog", (dialog) => {
    dialogs.push(dialog.message());
    void dialog.dismiss();
  });
  await signInAndConfirm(page);
  await createNote(page, "Untrusted", "Pasted below:");

  await page.keyboard.press("Enter");
  await pasteHtml(
    page,
    [
      "<p>Image <img src=\"/no-such-image.png\" onerror=\"window.__xss = 'img'; alert('img')\"> here</p>",
      "<script>window.__xss = 'script'; alert('script')</script>",
      "<p><a href=\"javascript:window.__xss='link';alert('link')\">Bad link</a> and ",
      '<a href="https://example.com/ok" class="evil" style="color:red" onclick="alert(1)">good link</a></p>',
      '<p style="color:red" onmouseover="alert(1)">Styled</p>',
      "<h4>Small heading</h4>",
    ].join(""),
    "Image here Bad link and good link",
  );

  const body = noteBody(page);
  await expect(body).toContainText("Bad link and good link");
  await expect(
    body.locator("img, script, [style], [onclick], [onerror]"),
  ).toHaveCount(0);
  await expect(body.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(body.getByText("Bad link", { exact: false })).toBeVisible();
  const good = body.locator("a", { hasText: "good link" });
  await expect(good).toHaveAttribute("href", "https://example.com/ok");
  await expect(good).not.toHaveAttribute("class", /evil/);
  // An h4 isn't allowed, so it arrives as a paragraph.
  await expect(body.locator("h4")).toHaveCount(0);
  await expect(body.locator("p", { hasText: "Small heading" })).toHaveCount(1);

  // Markup typed as text is stored and shown as text.
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.press("Enter");
  await page.keyboard.type(
    `<img src=x onerror="window.__xss='typed';alert('typed')"><script>alert('typed')</script>`,
  );
  await expectSaved(page);

  // The editor loads it back as text.
  await page.reload();
  await expect(noteBody(page)).toContainText(
    `<img src=x onerror="window.__xss='typed';alert('typed')"><script>alert('typed')</script>`,
  );
  await expect(noteBody(page).locator("img, script")).toHaveCount(0);

  // So does the read-only view.
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await page.goto("/notes/archived");
  await page.getByRole("link", { name: "Untrusted" }).click();
  const content = page.getByRole("article", { name: "Note" });
  await expect(content).toContainText(
    `<img src=x onerror="window.__xss='typed';alert('typed')"><script>alert('typed')</script>`,
  );
  await expect(content.locator("img, script, [onerror], [style]")).toHaveCount(
    0,
  );
  await expect(content.locator('a[href^="javascript:"]')).toHaveCount(0);
  await expect(content.locator("a")).toHaveAttribute(
    "rel",
    "noopener noreferrer",
  );

  expect(await page.evaluate(() => (window as { __xss?: string }).__xss)).toBe(
    undefined,
  );
  expect(dialogs).toEqual([]);
});

test("a save from a stale tab is a conflict that keeps the text and offers the saved version", async ({
  page,
  context,
}) => {
  await signInAndConfirm(page);
  const url = await createNote(page, "Shared", "Version one.");

  const other = await context.newPage();
  await other.goto(url);
  await expect(noteBody(other)).toContainText("Version one.");

  await noteBody(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Written in the first tab.");
  await expectSaved(page);

  await noteBody(other).click();
  await other.keyboard.press("ControlOrMeta+End");
  await other.keyboard.type(" Written in the second tab.");
  const conflict = other.getByRole("alert").filter({
    hasText: "This note changed somewhere else.",
  });
  await expect(conflict).toBeVisible();
  await expect(saveStatus(other)).toHaveText("Not saved");
  await expect(noteBody(other)).toContainText("Written in the second tab.");
  await expectNoSeriousViolations(other);

  await conflict
    .getByRole("button", { name: "Load the saved version" })
    .click();
  const confirm = other.getByRole("alertdialog", {
    name: "Load the saved version?",
  });
  await confirm.getByRole("button", { name: "Load the saved version" }).click();
  await expect(conflict).toHaveCount(0);
  await expect(noteBody(other)).toContainText("Written in the first tab.");
  await expect(noteBody(other)).not.toContainText("Written in the second tab.");
  await expectSaved(other);

  // Saving works again from the loaded version.
  await noteBody(other).click();
  await other.keyboard.press("ControlOrMeta+End");
  await other.keyboard.type(" And then the second.");
  await expectSaved(other);
  await page.reload();
  await expect(noteBody(page)).toContainText(
    "Written in the first tab. And then the second.",
  );
});

test("a failed save says Not saved with Retry, and leaving asks first", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await createNote(page, "Offline", "Saved before going offline.");

  // Server Action calls fail as if the network were down.
  const offline = (route: import("@playwright/test").Route) =>
    route.request().headers()["next-action"]
      ? route.abort("internetdisconnected")
      : route.fallback();
  await page.route("**/notes/**", offline);
  await noteBody(page).click();
  await page.keyboard.press("ControlOrMeta+End");
  await page.keyboard.type(" Typed while offline.");
  await expect(saveStatus(page)).toHaveText("Not saved");
  await expect(
    page.getByText(
      "Couldn't reach SoleUp. Check your connection, then try again.",
    ),
  ).toBeVisible();

  await mainNav(page).getByRole("link", { name: "Home" }).click();
  const leave = page.getByRole("alertdialog", {
    name: "Leave without saving?",
  });
  await expect(leave).toBeVisible();
  await expectNoSeriousViolations(page);
  await leave.getByRole("button", { name: "Stay on this note" }).click();
  await expect(leave).toHaveCount(0);
  await expect(page).toHaveURL(/\/notes\/[0-9a-f-]{36}$/);
  await expect(noteBody(page)).toContainText("Typed while offline.");

  await page.unroute("**/notes/**", offline);
  await page.getByRole("button", { name: "Retry" }).click();
  await expectSaved(page);
  await mainNav(page).getByRole("link", { name: "Notes" }).click();
  await page.getByRole("link", { name: "Offline" }).click();
  await expect(noteBody(page)).toContainText(
    "Saved before going offline. Typed while offline.",
  );
});

test("a note is archived read-only, restored, and deleted after confirming", async ({
  page,
}) => {
  await signInAndConfirm(page);
  await createNote(page, "Old plans", "Plans from last year.");

  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(
    page.getByRole("heading", { level: 2, name: "No notes yet" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Archived notes" }).click();
  const archived = page.getByRole("list", { name: "Archived notes" });
  await expect(archived.getByText(/^Archived on /)).toBeVisible();
  await expectNoSeriousViolations(page);
  await archived.getByRole("link", { name: "Old plans" }).click();

  // Read-only: no editor, the stored text shown.
  await expect(
    page.getByText(/^Archived on .*Restore it to change it\.$/),
  ).toBeVisible();
  await expect(noteBody(page)).toHaveCount(0);
  await expect(page.getByRole("article", { name: "Note" })).toHaveText(
    "Plans from last year.",
  );
  await expectNoSeriousViolations(page);

  await page.getByRole("button", { name: "Restore" }).click();
  await expect(noteBody(page)).toContainText("Plans from last year.");
  await expect(noteTitle(page)).toHaveValue("Old plans");

  // Deleting asks first; Cancel keeps the note.
  await page.getByRole("button", { name: "Delete note" }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete this note?" });
  await expect(confirm).toContainText("It can't be undone.");
  await expectNoSeriousViolations(page);
  await confirm.getByRole("button", { name: "Cancel" }).click();
  await expect(confirm).toHaveCount(0);
  await expect(noteBody(page)).toBeVisible();

  await page.getByRole("button", { name: "Delete note" }).click();
  await confirm.getByRole("button", { name: "Delete note" }).click();
  await expect(page).toHaveURL(/\/notes$/);
  await expect(
    page.getByRole("heading", { level: 2, name: "No notes yet" }),
  ).toBeVisible();
  await page.goto("/notes/archived");
  await expect(
    page.getByRole("heading", { level: 2, name: "Nothing archived" }),
  ).toBeVisible();
});

test("the editor works with the keyboard alone", async ({ page }) => {
  await signInAndConfirm(page);
  await page.goto("/notes/new");
  await expect(noteBody(page)).toBeVisible();

  await noteTitle(page).focus();
  await page.keyboard.type("Keyboard note");
  // From the title, Tab reaches each toolbar button, then the body.
  const toolbar = page.getByRole("group", { name: "Formatting" });
  const buttons = await toolbar.getByRole("button").all();
  expect(buttons.length).toBe(13);
  for (const button of buttons) {
    await page.keyboard.press("Tab");
    await expect(button).toBeFocused();
    const outline = await button.evaluate(
      (element) => getComputedStyle(element).outlineStyle,
    );
    expect(outline).not.toBe("none");
  }
  await page.keyboard.press("Tab");
  await expect(noteBody(page)).toBeFocused();

  await page.keyboard.press("ControlOrMeta+b");
  await page.keyboard.type("Strong start");
  await expect(toolbar.getByRole("button", { name: "Bold" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("ControlOrMeta+b");

  // Mod-K opens the link dialog from the body; Enter adds the link.
  await page.keyboard.press("ControlOrMeta+k");
  const linkDialog = page.getByRole("dialog", { name: "Add a link" });
  await expect(linkDialog.getByLabel("Link address")).toBeFocused();
  await page.keyboard.type("mailto:me@example.com");
  await page.keyboard.press("Enter");
  await expect(linkDialog).toHaveCount(0);
  await expect(noteBody(page)).toBeFocused();
  await expect(
    noteBody(page).locator('a[href="mailto:me@example.com"]'),
  ).toBeVisible();

  // Back from the body to Heading 1 (past Divider, Code block, Quote,
  // the two lists and Headings 3 and 2); Space applies it.
  await page.keyboard.press("Enter");
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press("Shift+Tab");
  }
  const heading1 = toolbar.getByRole("button", { name: "Heading 1" });
  await expect(heading1).toBeFocused();
  await page.keyboard.press("Space");
  await expect(heading1).toHaveAttribute("aria-pressed", "true");
  await expect(noteBody(page)).toBeFocused();
  await page.keyboard.type("Heading by keyboard");
  await expect(noteBody(page).locator("h1")).toHaveText("Heading by keyboard");
  await expectSaved(page);
  await expectNoSeriousViolations(page);
});

test("unknown and malformed note IDs are not found", async ({ page }) => {
  await signInAndConfirm(page);
  for (const id of ["00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
    await page.goto(`/notes/${id}`);
    await expect(
      page.getByRole("heading", { level: 1, name: "Note not found" }),
    ).toBeVisible();
  }
});
