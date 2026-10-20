import type { Instrumentation } from "next";

/**
 * Runs once when a Next.js server starts. Node-only code lives in
 * `instrumentation-node.ts` so the Edge bundle never includes it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnvOrExit } = await import("./instrumentation-node");
    await validateEnvOrExit();
  }
}

/**
 * Called for errors Next.js catches itself: rendering errors (shown by an
 * error.tsx boundary), and errors a route handler or Server Action does not
 * catch. Errors authedAction() handles are logged there instead.
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logRequestError } = await import("./instrumentation-node");
    await logRequestError(error, request, context);
  }
};
