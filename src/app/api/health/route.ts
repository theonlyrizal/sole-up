import { checkDatabase } from "@/server/db/health";
import { loggerFor, requestIdFrom } from "@/server/logging/request";

/**
 * Liveness and database check for the host and uptime monitors. Public and
 * unauthenticated, so it reports only "ok" or "unavailable", never why.
 * 200 when the database answers, 503 otherwise. Never cached.
 */
export async function GET(request: Request): Promise<Response> {
  // Reading the request also keeps this handler out of build-time
  // prerendering (Cache Components), so every call checks for real.
  const log = loggerFor(requestIdFrom(request.headers));

  const database = await checkDatabase();
  if (database.status !== "ok") {
    log.warn(
      { err: database.error, source: "health" },
      "Health check: database unavailable",
    );
  }

  const healthy = database.status === "ok";
  return Response.json(
    { status: healthy ? "ok" : "unavailable", database: database.status },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    },
  );
}
