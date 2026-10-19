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
