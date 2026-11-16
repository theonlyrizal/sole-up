import { expect, test } from "@playwright/test";
import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";
import { seedInsightEvidence } from "./insight-evidence";

test.use({ timezoneId: "UTC", viewport: { width: 375, height: 812 } });

test("Review Insights shows evidence and links to the relevant work", async ({
  page,
}) => {
  test.slow();
  await page.emulateMedia({ reducedMotion: "reduce" });
  const userId = await signInAndConfirm(page);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("button", { name: "More", exact: true })
    .click();
  await page
    .getByRole("dialog", { name: "More", exact: true })
    .getByRole("link", { name: "Review", exact: true })
    .click();
  const navigation = page.getByRole("navigation", { name: "Review pages" });
  await expect(
    navigation.getByRole("link", { name: "Weekly review" }),
  ).toHaveAttribute("aria-current", "page");
  await navigation.getByRole("link", { name: "Insights" }).press("Enter");
  await expect(page).toHaveURL(/\/review\/insights$/);
  await expect(
    page.getByRole("heading", { name: "Insights", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("No task history yet.")).toBeVisible();
  await expect(page.getByText("No active goals yet.")).toBeVisible();
  await expect(
    page.getByText("No task deadlines in these weekly snapshots."),
  ).toBeVisible();
  await expect(
    page.getByText("No expected or skipped habit activity in these weeks."),
  ).toBeVisible();
  await expect(
    page.getByText("No open tasks planned or due next week."),
  ).toBeVisible();

  await seedInsightEvidence(userId);
  await page.reload();
  const insights = page.getByRole("list", { name: "Insights", exact: true });
  await expect(insights.getByRole("heading", { level: 2 })).toHaveCount(5);
  await expect(
    insights.getByText("0 of 1 planned tasks completed"),
  ).toBeVisible();
  const definition = insights.getByRole("button", {
    name: "How this is counted: Goal inactivity",
  });
  const definitionSheet = page.getByRole("dialog", {
    name: "How this is counted",
  });
  await expect(async () => {
    if (!(await definitionSheet.isVisible())) await definition.press("Enter");
    await expect(definitionSheet).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(
    definitionSheet.getByText(/Local calendar days since each active goal/),
  ).toBeVisible();
  await expect(
    definitionSheet.getByText("As of", { exact: true }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(definition).toBeFocused();
  await expect(
    insights.getByRole("link", { name: "Read more fiction" }),
  ).toHaveAttribute("href", /\/goals\//);
  await expect(
    insights.getByRole("cell", { name: "1", exact: true }),
  ).toBeVisible();
  await expect(
    insights.getByRole("cell", { name: "None expected", exact: true }),
  ).toHaveCount(3);
  await expect(
    insights.getByRole("cell", { name: "1 of 6 · 1 skipped" }),
  ).toBeVisible();
  await expect(
    insights.getByRole("link", { name: "Read a chapter" }),
  ).toHaveAttribute("href", /\/track\?range=12w#habit-/);
  await expect(insights.getByText("45 estimated minutes")).toBeVisible();
  await expect(
    insights.getByText("1 with estimates · 1 without estimates"),
  ).toBeVisible();
  await expectNoSeriousViolations(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);

  for (const link of [
    "Review tasks planned for this week",
    "Review tasks counted as overdue",
  ]) {
    await insights.getByRole("link", { name: link }).click();
    await expect(
      navigation.getByRole("link", { name: "Insights" }),
    ).toHaveAttribute("aria-current", "page");
    const tasks = page.getByRole("list", { name: "Tasks", exact: true });
    await expect(tasks.getByRole("listitem")).toHaveCount(1);
    await expect(
      tasks.getByRole("button", { name: "Return a book", exact: true }),
    ).toBeVisible();
    await expectNoSeriousViolations(page);
    await page.getByRole("link", { name: "← Insights" }).click();
  }

  await insights
    .getByRole("link", { name: "Review tasks in next week’s workload" })
    .click();
  const tasks = page.getByRole("list", { name: "Tasks", exact: true });
  await expect(tasks.getByRole("listitem")).toHaveCount(2);
  await expectNoSeriousViolations(page);
  await tasks
    .getByRole("button", { name: "Pick up a book", exact: true })
    .click();
  const editor = page.getByRole("dialog", { name: "Edit task" });
  await editor.getByLabel("Estimate (minutes)", { exact: true }).fill("60");
  await editor.getByRole("button", { name: "Save", exact: true }).click();
  await expect(editor).toBeHidden();
  await page.getByRole("link", { name: "← Insights" }).click();
  await expect(insights.getByText("60 estimated minutes")).toBeVisible();

  const dismiss = insights.getByRole("button", {
    name: "Dismiss for this period: Next-week workload",
  });
  const requested = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const insightsPath = "**/review/insights";
  await page.route(insightsPath, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    requested.resolve();
    await release.promise;
    return route.abort("failed");
  });
  await dismiss.press("Enter");
  try {
    await requested.promise;
    await expect(dismiss).toBeDisabled();
    await expect(dismiss).toContainText("Dismissing…");
    await expect(insights.getByText("60 estimated minutes")).toBeVisible();
    await page.screenshot({
      path: test.info().outputPath("dismiss-pending.png"),
      animations: "disabled",
    });
  } finally {
    release.resolve();
  }
  const error = insights.getByRole("alert");
  await expect(error).toHaveText(
    "The insight couldn't be dismissed. Try again.",
  );
  await error.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("dismiss-error.png"),
    animations: "disabled",
  });
  await page.unroute(insightsPath);
  await dismiss.press("Enter");
  await expect(
    insights.getByRole("heading", { name: "Next-week workload" }),
  ).toHaveCount(0);
  const dismissed = page.getByText(
    "One insight is dismissed for its current reporting period.",
  );
  await dismissed.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: test.info().outputPath("dismiss-confirmed.png"),
    animations: "disabled",
  });
  await page.reload();
  await expect(insights.getByRole("heading", { level: 2 })).toHaveCount(4);
  await expect(dismissed).toBeVisible();
  await expect(
    insights.getByRole("heading", { name: "Next-week workload" }),
  ).toHaveCount(0);
});

test("invalid insight keys and reporting dates keep a way back to Insights", async ({
  page,
}) => {
  await signInAndConfirm(page);
  for (const path of [
    "/review/insights/missing?start=2026-01-01",
    "/review/insights/next_week_workload?start=bad",
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "We couldn't find that" }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Back to Insights" }),
    ).toHaveAttribute("href", "/review/insights");
  }
});
