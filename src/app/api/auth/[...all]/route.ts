import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/server/auth/auth";
import {
  loggerFor,
  requestIdFrom,
  runWithRequestId,
} from "@/server/logging/request";

const handlers = toNextJsHandler(auth);

/**
 * Better Auth rethrows unexpected errors (`onAPIError.throw`). Log them with
 * the request ID (pino reduces the error to its class, Postgres code and
 * stack, see serializeError) and answer a bare 500, so no query params,
 * OAuth state or tokens reach the logs or the client.
 */
function withRedactedErrors(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    const requestId = requestIdFrom(request.headers);
    try {
      // Better Auth's own log lines (logAuth) pick the ID up from here.
      return await runWithRequestId(requestId, () => handler(request));
    } catch (error) {
      loggerFor(requestId).error(
        {
          err: error,
          source: "auth",
          path: new URL(request.url).pathname,
        },
        "Unhandled error in an auth route",
      );
      return new Response(null, { status: 500 });
    }
  };
}

export const GET = withRedactedErrors(handlers.GET);
export const POST = withRedactedErrors(handlers.POST);
