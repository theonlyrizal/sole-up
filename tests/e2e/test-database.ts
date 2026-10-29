import { Pool } from "pg";

import { testDatabaseUrl } from "../../playwright.config";
import { assertTestDatabaseUrl } from "../integration/helpers/database";

/**
 * Moves a user's weekly reviews two weeks into the past, as if two weeks
 * had gone by: last week's review is then closed (ADR 0015). The app
 * server's clock can't be changed from a test, so this goes through the
 * e2e server's test database, with the same safety check as global setup.
 */
export async function moveReviewsTwoWeeksBack(userId: string) {
  const pool = new Pool({
    connectionString: assertTestDatabaseUrl(testDatabaseUrl),
  });
  try {
    await pool.query(
      `update weekly_reviews
          set period_start = period_start - 14, period_end = period_end - 14
        where user_id = $1`,
      [userId],
    );
  } finally {
    await pool.end();
  }
}
