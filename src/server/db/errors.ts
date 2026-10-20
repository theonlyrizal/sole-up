/**
 * True when `error` is Postgres rejecting a write for `constraint` with a
 * unique violation (SQLSTATE 23505). Drizzle wraps driver errors in a
 * DrizzleQueryError whose `cause` is the pg error, so both are checked.
 *
 * Map the violation to a domain error with fixed text; never show or log
 * the original error, whose message includes the query parameters.
 */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  return isViolation(error, "23505", constraint);
}

/**
 * True when `error` is Postgres rejecting a write for `constraint` with a
 * foreign key violation (SQLSTATE 23503). Same rules as isUniqueViolation().
 */
export function isForeignKeyViolation(
  error: unknown,
  constraint: string,
): boolean {
  return isViolation(error, "23503", constraint);
}

function isViolation(
  error: unknown,
  sqlState: string,
  constraint: string,
): boolean {
  for (let current = error; current instanceof Error;) {
    const { code, constraint: name } = current as Error & {
      code?: unknown;
      constraint?: unknown;
    };
    if (code === sqlState && name === constraint) return true;
    current = current.cause;
  }
  return false;
}
