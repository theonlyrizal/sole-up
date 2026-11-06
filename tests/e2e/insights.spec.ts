import { expect, test } from "@playwright/test";
import { Pool } from "pg";

import { testDatabaseUrl } from "../../playwright.config";
import { addDays, startOfWeek, todayFor } from "../../src/lib/dates";
import { assertTestDatabaseUrl } from "../integration/helpers/database";
import { expectNoSeriousViolations, signInAndConfirm } from "./helpers";

test.use({ timezoneId: "UTC", viewport: { width: 375, height: 812 } });

test("Review Insights shows evidence and links to the relevant work", async ({
  page,
}) => {
  test.slow();
  const userId = await signInAndConfirm(page);
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Review", exact: true })
    .click();
  await page
    .getByRole("navigation", { name: "Review pages" })
    .getByRole("link", { name: "Insights" })
    .click();
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
  await expect(
    insights.getByText(/Local calendar days since each active goal/),
  ).toBeVisible();
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
  await expect(insights.getByText("45 estimated minutes")).toBeVisible();
  await expect(
    insights.getByText("1 with estimates · 1 without estimates"),
  ).toBeVisible();
  await expectNoSeriousViolations(page);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);

  await insights.getByRole("link", { name: "Review upcoming tasks" }).click();
  await expect(page).toHaveURL(/\/plan\/upcoming\?days=14$/);
  await expect(page.getByText("Pick up a book", { exact: true })).toBeVisible();
});

async function seedInsightEvidence(userId: string) {
  const week = startOfWeek(todayFor("UTC"), 1);
  const lastWeek = addDays(week, -7);
  const nextWeek = addDays(week, 7);
  const pool = new Pool({
    connectionString: assertTestDatabaseUrl(testDatabaseUrl),
  });
  try {
    await pool.query(
      `insert into goals (user_id, title, created_at)
       values ($1, 'Read more fiction', $2)`,
      [userId, `${lastWeek}T12:00:00Z`],
    );
    await pool.query(
      `with planned as (
         insert into tasks (user_id, title, created_at, planned_date, due_date)
         values ($1, 'Return a book', $2, $3, $3) returning id
       )
       insert into audit_events (user_id, entity_id, entity_type, event_type, changes)
       select $1, id, 'task', 'task.created', jsonb_build_object(
         'plannedDate', jsonb_build_object('from', null, 'to', $3::date)
       ) from planned`,
      [userId, `${lastWeek}T12:00:00Z`, lastWeek],
    );
    await pool.query(
      `insert into tasks (user_id, title, planned_date, estimated_minutes)
       values ($1, 'Pick up a book', $2, 45), ($1, 'Find a bookmark', $2, null)`,
      [userId, nextWeek],
    );
    const {
      rows: [habit],
    } = await pool.query<{ id: string }>(
      `insert into habits (user_id, title, measure, start_date)
       values ($1, 'Read a chapter', 'check', $2) returning id`,
      [userId, lastWeek],
    );
    await pool.query(
      `insert into habit_schedules (user_id, habit_id, effective_from, cadence_type, cadence_config)
       values ($1, $2, $3, 'daily', '{}')`,
      [userId, habit.id, lastWeek],
    );
    await pool.query(
      `insert into habit_logs (user_id, habit_id, local_date, status)
       values ($1, $2, $3, 'completed'), ($1, $2, $4, 'skipped')`,
      [userId, habit.id, lastWeek, addDays(lastWeek, 1)],
    );
  } finally {
    await pool.end();
  }
}
