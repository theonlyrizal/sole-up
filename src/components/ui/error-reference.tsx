/**
 * The ID a user can quote when reporting an error. It is also in the server
 * log line for that error, so the two can be matched. Renders nothing
 * without an ID.
 */
export function ErrorReference({ id }: { id: string | undefined }) {
  if (!id) return null;
  return (
    <p className="text-sm text-muted">
      Reference: <code className="font-mono select-all">{id}</code>
    </p>
  );
}

/** The digest Next.js gives an error from the server, if it has one. */
export function errorDigest(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("digest" in error)) {
    return undefined;
  }
  return typeof error.digest === "string" ? error.digest : undefined;
}
