import { Pool } from "pg";

import { testDatabaseUrl } from "../../playwright.config";
import { addDays, startOfWeek, todayFor } from "../../src/lib/dates";
import { assertTestDatabaseUrl } from "../integration/helpers/database";

export async function seedInsightEvidence(userId: string) {
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
         values ($1, 'Return a book', $2, null, $3::date) returning id
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
