import { expect, test, type Page } from "@playwright/test";

import { addDays } from "../../src/lib/dates";
import { reviewHref } from "../../src/lib/review-flow";
import { THEME_STORAGE_KEY } from "../../src/lib/theme";
import { seedVisualData } from "./visual-data";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";
import { moveReviewsTwoWeeksBack } from "./test-database";

// Review history (chunk 7.4): past reviews listed newest first, a read-only
// view of each, Edit only while the week is open, the server refusing a
// write once it has closed, and a confirmed delete.

test.use({ viewport: { width: 1280, height: 800 } });

const WINS = "Walked every day.";
const EDITED_WINS = "Walked every day, twice on Sunday.";

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

function pastReviews(page: Page) {
  return page.getByRole("list", { name: "Past reviews" });
}

async function expectStep(page: Page, label: string) {
  await expect(
    page.getByRole("heading", { level: 2, name: label }),
  ).toBeVisible();
  await expect(
    stepsNav(page).getByRole("link", { name: label }),
  ).toHaveAttribute("aria-current", "step");
}

/** Through the review page's link, once a review exists. */
async function openHistory(page: Page) {
  await page.getByRole("button", { name: "Review options" }).click();
  await page.getByRole("menuitem", { name: "Past reviews" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Past reviews" }),
  ).toBeVisible();
}

test("an open review is edited, a closed one is read-only, and delete removes it", async ({
  page,
}) => {
  test.slow();
  const userId = await signInAndConfirm(page);

  // Opening /review starts a review, so come straight to the history.
  await page.goto("/review/history");
  await expect(
    page.getByRole("heading", { level: 2, name: "No reviews yet" }),
  ).toBeVisible();

  // Review last week, saving Reflect on the way to Adjust.
  await page.getByRole("link", { name: "Review a week" }).click();
  await expectStep(page, "Look back");
  await page.getByRole("button", { name: "Next: Reflect" }).click();
  await expectStep(page, "Reflect");
  await page.getByLabel("Wins").fill(WINS);
  // The overflow navigation saves the draft even when leaving the flow.

  // The list: last week, not finished, open.
  await openHistory(page);
  await expect(pastReviews(page).getByRole("listitem")).toHaveCount(1);
  await expect(pastReviews(page)).toContainText("Last week:");
  await expect(pastReviews(page)).toContainText(/Not finished\s*Open until/);
  await expectNoSeriousViolations(page);

  // The view: read-only text and summary "as of", with Edit.
  await pastReviews(page)
    .getByRole("link", { name: /^Last week:/ })
    .click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Weekly review" }),
  ).toBeVisible();
  await expect(reviewedWeek(page)).toContainText("Not finished");
  await expect(page.getByText(WINS)).toBeVisible();
  await expect(page.getByLabel("Wins")).toHaveCount(0);
  const info = page.getByRole("button", {
    name: "How this is counted: Tasks completed",
  });
  await info.press("Enter");
  await expect(
    page.getByRole("dialog", { name: "How this is counted" }),
  ).toContainText("As of");
  await page.keyboard.press("Escape");
  await expect(info).toBeFocused();
  await expectNoSeriousViolations(page);

  // Edit reopens the flow on that week.
  await page.getByRole("link", { name: "Edit review" }).click();
  await expectStep(page, "Look back");
  await expect(reviewedWeek(page)).toContainText("Last week");
  await stepsNav(page).getByRole("link", { name: "Reflect" }).click();
  await expectStep(page, "Reflect");
  await page.getByLabel("Wins").fill(EDITED_WINS);
  await stepsNav(page).getByRole("link", { name: "Choose priorities" }).click();
  await expectStep(page, "Choose priorities");
  await page.getByRole("button", { name: "Finish review" }).click();
  await page
    .getByRole("dialog", { name: "Your review is saved" })
    .getByRole("button", { name: "Done", exact: true })
    .click();

  // A tab left open on Reflect while the week closes: the server refuses
  // the write, and nothing changes.
  await stepsNav(page).getByRole("link", { name: "Reflect" }).click();
  await expectStep(page, "Reflect");
  await expect(page.getByLabel("Wins")).toHaveValue(EDITED_WINS);
  await moveReviewsTwoWeeksBack(userId);
  await page.getByLabel("Wins").fill("Written too late.");
  await page.getByRole("button", { name: "Next: Adjust" }).click();
  await expect(
    page.getByRole("alert").filter({
      hasText: "This review is closed for editing.",
    }),
  ).toBeVisible();
  await expectStep(page, "Reflect");

  await expect(page.getByLabel("Wins")).toHaveValue("Written too late.");
  await expect(page.getByRole("status").getByText("Not saved")).toBeVisible();

  // The closed review: the date it closed, its text as saved, no Edit.
  // (Opening /review now would start a review of last week, which no
  // longer has one.)
  await page.goto("/review/history");
  await expect(pastReviews(page).getByRole("listitem")).toHaveCount(1);
  await expect(pastReviews(page)).toContainText("Finished on");
  await expect(pastReviews(page)).toContainText("Closed on");
  await expect(pastReviews(page)).not.toContainText("Last week:");
  await pastReviews(page).getByRole("link").click();
  await expect(reviewedWeek(page)).toContainText("Closed on");
  await expect(
    page.getByText("This week has closed, so the review is read-only."),
  ).toBeVisible();
  await expect(page.getByText(EDITED_WINS)).toBeVisible();
  await expect(page.getByText("Written too late.")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit review" })).toHaveCount(0);
  await expectNoSeriousViolations(page);

  // Delete, closed or not, after a confirmation. Cancel keeps it.
  await page.getByRole("button", { name: "Review options" }).click();
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  const dialog = page.getByRole("alertdialog", {
    name: /^Delete the review of /,
  });
  await expect(dialog).toContainText("can't be undone");
  await expectNoSeriousViolations(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(EDITED_WINS)).toBeVisible();

  await page.getByRole("button", { name: "Review options" }).click();
  await page.getByRole("menuitem", { name: "Delete…" }).click();
  await dialog.getByRole("button", { name: "Delete review" }).click();
  await expect(toastSaying(page, "Review deleted").first()).toBeVisible();
  await expect(page).toHaveURL(/\/review\/history$/);
  await expect(
    page.getByRole("heading", { level: 2, name: "No reviews yet" }),
  ).toBeVisible();
});

test("an unknown review is not found", async ({ page }) => {
  await signInAndConfirm(page);
  await page.goto(`/review/history/${crypto.randomUUID()}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "We couldn't find that" }),
  ).toBeVisible();
  await page.goto("/review/history/not-a-review");
  await expect(
    page.getByRole("heading", { level: 1, name: "We couldn't find that" }),
  ).toBeVisible();
});

for (const width of [390, 1280]) {
  for (const theme of ["light", "dark"] as const) {
    test(`review history and detail are accessible at ${width} in ${theme}`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: "reduce" });
      await page.addInitScript(
        (key) => localStorage.setItem(key, "system"),
        THEME_STORAGE_KEY,
      );
      const { pastReviewId, lastWeek } = await seedVisualData(page);
      await page.goto("/review/history");
      await expect(pastReviews(page).getByRole("listitem")).toHaveCount(2);
      await expect(
        pastReviews(page).getByRole("listitem").first(),
      ).toContainText("Last week");
      await expectNoSeriousViolations(page);
      await pastReviews(page)
        .getByRole("link", { name: /^Last week:/ })
        .click();
      await expect(
        page.getByRole("link", { name: "Edit review" }),
      ).toBeVisible();
      await expectNoSeriousViolations(page);
      await page.goto(`/review/history/${pastReviewId}`);
      await expect(
        page.getByText("This week has closed, so the review is read-only."),
      ).toBeVisible();
      await expectNoSeriousViolations(page);
      const options = page.getByRole("button", { name: "Review options" });
      await options.press("Enter");
      await page.getByRole("menuitem", { name: "Delete…" }).press("Enter");
      const confirm = page.getByRole("alertdialog", {
        name: /^Delete the review of /,
      });
      await expect(
        confirm.getByRole("button", { name: "Cancel" }),
      ).toBeFocused();
      await expectNoSeriousViolations(page);
      await page.keyboard.press("Escape");
      await expect(options).toBeFocused();
      const closedWeek = addDays(lastWeek, -14);
      await page.goto(reviewHref(closedWeek, "adjust"));
      await expect(
        page.getByText("This week has closed, so the review is read-only."),
      ).toBeVisible();
      await expect(
        page.getByRole("heading", { name: "Adjust", exact: true }),
      ).toHaveCount(0);
      await expectNoSeriousViolations(page);
    });
  }
}
