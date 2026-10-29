// Hands a search from the shell's field to the search page in memory
// (chunk 8.4). Search terms never go into a URL (ADR 0016), and the App
// Router keeps this module alive across client-side navigation, so the
// page takes the term from here. A full reload drops it, which is fine:
// the page then opens empty.

let requested: string | null = null;
const listeners = new Set<() => void>();

/** Asks the search page to run `query`, now if it's open, or when it opens. */
export function requestSearch(query: string): void {
  requested = query;
  for (const listener of listeners) listener();
}

/** The requested query, once: taking it clears it. */
export function takeRequestedSearch(): string | null {
  const query = requested;
  requested = null;
  return query;
}

/** Calls `listener` on each request; returns the unsubscribe function. */
export function onSearchRequested(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
