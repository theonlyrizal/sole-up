/**
 * How errors appear in logs. An error's message is never logged: Drizzle
 * embeds the query and its params in it, Postgres can quote input values,
 * and any message may carry user content. What is kept identifies the
 * failure without its data: the class, a Postgres SQLSTATE code with the
 * constraint/table it names, the stack frames (without the message line)
 * and the same for each cause.
 */

export type SerializedError = {
  type: string;
  code?: string;
  constraint?: string;
  table?: string;
  stack?: string[];
  cause?: SerializedError;
};

const SQLSTATE = /^[0-9A-Z]{5}$/;
const MAX_CAUSES = 3;
const MAX_FRAMES = 15;

export function serializeError(error: unknown, depth = 0): SerializedError {
  if (!(error instanceof Error)) {
    return { type: error === null ? "null" : typeof error };
  }

  const result: SerializedError = { type: error.name || "Error" };
  const { code, constraint, table } = error as {
    code?: unknown;
    constraint?: unknown;
    table?: unknown;
  };
  if (typeof code === "string" && SQLSTATE.test(code)) {
    result.code = code;
    if (typeof constraint === "string") result.constraint = constraint;
    if (typeof table === "string") result.table = table;
  }

  const frames = (error.stack ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("at "))
    .slice(0, MAX_FRAMES);
  if (frames.length > 0) result.stack = frames;

  if (error.cause !== undefined && depth < MAX_CAUSES) {
    result.cause = serializeError(error.cause, depth + 1);
  }
  return result;
}
