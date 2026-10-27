import { env } from "@/server/env";
import { loggerFor, requestIdFrom } from "@/server/logging/request";
import { hasSweepSecret } from "@/server/modules/reminders/sweep-auth";
import { runSweep } from "@/server/modules/reminders/sweep";

const NO_STORE = { "cache-control": "no-store" };

/**
 * Runs one reminder sweep (ADR 0013). cron-job.org calls it every 15 minutes
 * with `Authorization: Bearer <REMINDER_SWEEP_SECRET>`; `pnpm reminders:sweep`
 * does the same locally.
 *
 * Not a session route: the secret is the only credential, and it can only
 * start a sweep. A missing or wrong secret gets the same 401. The request
 * body is never read, and the response holds only counts and the duration.
 */
export async function POST(request: Request): Promise<Response> {
  const log = loggerFor(requestIdFrom(request.headers));

  if (!hasSweepSecret(request.headers, env.REMINDER_SWEEP_SECRET)) {
    log.warn({ source: "reminders" }, "Reminder sweep refused: bad secret");
    return Response.json(
      { error: "unauthorized" },
      {
        status: 401,
        headers: { ...NO_STORE, "www-authenticate": "Bearer" },
      },
    );
  }

  try {
    const result = await runSweep(new Date(), log);
    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    log.error({ err: error, source: "reminders" }, "Reminder sweep failed");
    return Response.json(
      { error: "internal" },
      { status: 500, headers: NO_STORE },
    );
  }
}
