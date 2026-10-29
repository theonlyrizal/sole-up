import { expect, test, type Page } from "@playwright/test";

import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";
import { moveReviewsTwoWeeksBack } from "./test-database";

// Review history (chunk 7.4): past reviews listed newest first, a read-only
// view of each, Edit only while the week is open, the server refusing a
// write once it has closed, and a confirmed delete.

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
  await page.goto("/review");
  await page.getByRole("link", { name: "Past reviews" }).click();
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
  await page.getByRole("button", { name: "Next: Adjust" }).click();
  await expectStep(page, "Adjust");

  // The list: last week, not finished, open.
  await openHistory(page);
  await expect(pastReviews(page).getByRole("listitem")).toHaveCount(1);
  await expect(pastReviews(page)).toContainText("Last week:");
  await expect(pastReviews(page)).toContainText("Not finished · Open until");
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
  await expect(
    page.getByRole("region", { name: "Look back" }).getByText(/^As of/),
  ).toBeVisible();
  await expectNoSeriousViolations(page);

  // Edit reopens the flow on that week.
  await page.getByRole("link", { name: "Edit review" }).click();
  await expectStep(page, "Look back");
  await expect(reviewedWeek(page)).toContainText("Last week:");
  await stepsNav(page).getByRole("link", { name: "Reflect" }).click();
  await expectStep(page, "Reflect");
  await page.getByLabel("Wins").fill(EDITED_WINS);
  await stepsNav(page).getByRole("link", { name: "Choose priorities" }).click();
  await expectStep(page, "Choose priorities");
  await page.getByRole("button", { name: "Finish review" }).click();
  await expect(toastSaying(page, "Review finished").first()).toBeVisible();

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
  await expect(reviewedWeek(page)).toContainText("it can't be changed");
  await expect(page.getByText(EDITED_WINS)).toBeVisible();
  await expect(page.getByText("Written too late.")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Edit review" })).toHaveCount(0);
  await expectNoSeriousViolations(page);

  // Delete, closed or not, after a confirmation. Cancel keeps it.
  await page.getByRole("button", { name: "Delete review" }).click();
  const dialog = page.getByRole("alertdialog", {
    name: /^Delete the review of /,
  });
  await expect(dialog).toContainText("can't be undone");
  await expectNoSeriousViolations(page);
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText(EDITED_WINS)).toBeVisible();

  await page.getByRole("button", { name: "Delete review" }).click();
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
    page.getByRole("heading", { level: 1, name: "Review not found" }),
  ).toBeVisible();
  await page.goto("/review/history/not-a-review");
  await expect(
    page.getByRole("heading", { level: 1, name: "Review not found" }),
  ).toBeVisible();
});
