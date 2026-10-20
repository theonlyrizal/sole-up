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
