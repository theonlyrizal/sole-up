import { vi } from "vitest";

/**
 * Captures what the app logger (src/server/logging/logger.ts) writes to
 * stdout, without printing it. Restore with `vi.restoreAllMocks()`.
 */
export function captureLogs() {
  const lines: string[] = [];
  vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
    lines.push(String(chunk));
    return true;
  });
  return {
    /** Everything written, as one string. */
    text: () => lines.join(""),
    /** Each line parsed as JSON. */
    entries: () =>
      lines
        .join("")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as Record<string, unknown>),
  };
}
