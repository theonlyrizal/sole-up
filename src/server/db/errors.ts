/**
 * True when `error` is Postgres rejecting a write for `constraint` with a
 * unique violation (SQLSTATE 23505). Drizzle wraps driver errors in a
 * DrizzleQueryError whose `cause` is the pg error, so both are checked.
 *
 * Map the violation to a domain error with fixed text; never show or log
 * the original error, whose message includes the query parameters.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let current = error; current instanceof Error;) {
    const { code, constraint: name } = current as Error & {
      code?: unknown;
      constraint?: unknown;
    };
    if (code === "23505" && name === constraint) return true;
    current = current.cause;
  }
  return false;
}
