/**
 * Validates the environment at boot, so a misconfigured server exits right
 * away with a readable list of problems instead of failing on a request.
 */
export async function validateEnvOrExit() {
  try {
    await import("./server/env");
  } catch (error) {
    if (error instanceof Error && error.name === "EnvValidationError") {
      console.error(`\n${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

type RequestErrorArgs = Parameters<
  import("next").Instrumentation.onRequestError
>;

/**
 * Logs an error Next.js caught, with the request ID and the error's digest.
 * The digest is the reference error.tsx shows the user (Next.js sends only
 * the digest to the browser), so either ID finds this line. The path is
 * logged without its query string, which can hold OAuth codes or state.
 */
export async function logRequestError(
  ...[error, request, context]: RequestErrorArgs
) {
  const { loggerFor, requestIdFrom } = await import("./server/logging/request");
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String(error.digest)
      : undefined;
  loggerFor(requestIdFrom(request.headers)).error(
    {
      err: error,
      source: "next",
      digest,
      method: request.method,
      path: request.path.split("?")[0],
      routePath: context.routePath,
      routeType: context.routeType,
    },
    "Unhandled request error",
  );
}
