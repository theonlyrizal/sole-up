import "server-only";

import pino, { type Logger } from "pino";

import { redactDeep } from "./redact";

export type { Logger };

/**
 * Builds the app logger: JSON lines, ISO timestamps (UTC), and two layers of
 * protection for the "Never log" rule:
 *
 * - Errors anywhere in a log object, `err` included, are reduced to
 *   serializeError() (no message) by redactDeep(), and an error logged without a message gets a fixed one, never
 *   `error.message` (pino's default).
 * - Every finished line is parsed and passed through redactDeep(), so a
 *   redacted key is removed wherever it appears, including child bindings
 *   (pino applies no formatter to those).
 *
 * Messages themselves are not scrubbed: pass fixed text only, and put
 * details in fields.
 *
 * `write` receives each finished line. The app writes to stdout; tests pass
 * their own function to read the output.
 */
export function createLogger(
  write: (line: string) => void = (line) => {
    process.stdout.write(line);
  },
): Logger {
  return pino(
    {
      level: "info",
      base: { pid: process.pid },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
        log: (object) => redactDeep(object),
      },
      hooks: {
        logMethod(args, method) {
          const [first, ...rest] = args as unknown[];
          if (first instanceof Error) {
            return method.apply(this, [
              { err: first },
              ...withMessage(rest),
            ] as Parameters<typeof method>);
          }
          if (
            typeof first === "object" &&
            first !== null &&
            "err" in first &&
            typeof rest[0] !== "string"
          ) {
            return method.apply(this, [
              first,
              ...withMessage(rest),
            ] as Parameters<typeof method>);
          }
          return method.apply(this, args);
        },
      },
    },
    {
      write(line: string) {
        write(redactLine(line));
      },
    },
  );
}

function withMessage(rest: unknown[]): unknown[] {
  return typeof rest[0] === "string" ? rest : ["Unexpected error", ...rest];
}

function redactLine(line: string): string {
  try {
    return `${JSON.stringify(redactDeep(JSON.parse(line)))}\n`;
  } catch {
    // Not JSON (should not happen): drop it rather than risk leaking it.
    return `${JSON.stringify({ level: "error", msg: "Unparseable log line dropped" })}\n`;
  }
}

/** The app's logger. Use getRequestLogger() inside a request. */
export const logger = createLogger();
