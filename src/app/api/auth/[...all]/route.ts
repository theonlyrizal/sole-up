import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/server/auth/auth";
import { logAuth } from "@/server/auth/logger";

const handlers = toNextJsHandler(auth);

/**
 * Better Auth rethrows unexpected errors (`onAPIError.throw`). Log them
 * redacted and answer a bare 500, so no query params, OAuth state or tokens
 * reach the logs or the client.
 */
function withRedactedErrors(handler: (request: Request) => Promise<Response>) {
  return async (request: Request): Promise<Response> => {
    try {
      return await handler(request);
    } catch (error) {
      logAuth(
        "error",
        `Unhandled error in ${new URL(request.url).pathname}`,
        error,
      );
      return new Response(null, { status: 500 });
    }
  };
}

export const GET = withRedactedErrors(handlers.GET);
export const POST = withRedactedErrors(handlers.POST);
