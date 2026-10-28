import { getUserFromHeaders } from "@/server/auth/session";
import { env } from "@/server/env";
import { DomainError } from "@/server/errors";
import { loggerFor, requestIdFrom } from "@/server/logging/request";
import { snoozeReminder } from "@/server/modules/reminders/snooze";
import { snoozeReminderSchema } from "@/server/modules/reminders/validation";

const NO_STORE = { "cache-control": "no-store" };

const STATUS_FOR: Record<string, number> = {
  NOT_FOUND: 404,
  CONFLICT: 409,
  VALIDATION: 400,
};

/**
 * Snoozes a reminder from its notification (ADR 0013): the service
 * worker's "Snooze 15 min" and "Snooze 1 hour" actions POST
 * `{ "minutes": 15 | 60 }` here with the session cookie.
 *
 * - Session required (401 without one). The reminder must be the user's
 *   (404 otherwise, the same as a missing one).
 * - Same origin only: a request whose `Origin` isn't the app's is refused
 *   (403), so another site can't snooze on the user's behalf.
 * - Answers `{ fireAt }`, or `{ error }` with a fixed code. Nothing about
 *   the reminder is logged.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const appOrigin = new URL(env.BETTER_AUTH_URL).origin;
  if (request.headers.get("origin") !== appOrigin) {
    return Response.json(
      { error: "forbidden" },
      { status: 403, headers: NO_STORE },
    );
  }
  const user = await getUserFromHeaders(request.headers);
  if (!user) {
    return Response.json(
      { error: "unauthorized" },
      { status: 401, headers: NO_STORE },
    );
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = snoozeReminderSchema.safeParse({
    id: (await params).id,
    minutes:
      body && typeof body === "object" && "minutes" in body
        ? body.minutes
        : undefined,
  });
  if (!parsed.success) {
    return Response.json(
      { error: "invalid" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const { fireAt } = await snoozeReminder(user.id, parsed.data);
    return Response.json({ fireAt }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof DomainError) {
      const { code } = error.toActionError();
      return Response.json(
        { error: code.toLowerCase() },
        { status: STATUS_FOR[code] ?? 400, headers: NO_STORE },
      );
    }
    loggerFor(requestIdFrom(request.headers)).error(
      { err: error, source: "reminders" },
      "Reminder snooze failed",
    );
    return Response.json(
      { error: "internal" },
      { status: 500, headers: NO_STORE },
    );
  }
}
