// Search across notes, goal titles and task titles (chunk 8.4, ADR 0016).
// Pure, so the search page and the server share the limits and the
// highlight format.
//
// The server asks `ts_headline` to wrap each match in two private control
// characters, never in HTML. The page splits the text on them and renders
// matches as `<mark>` elements, so stored text containing markup is only
// ever shown as text.

/** A search holds at most this many characters, after trimming. */
export const SEARCH_QUERY_MAX = 200;

/** Each group (notes, goals, tasks) shows at most this many results. */
export const SEARCH_GROUP_LIMIT = 20;

/** Starts a highlighted match (U+0002, START OF TEXT). */
export const HIGHLIGHT_START = "\u0002";

/** Ends a highlighted match (U+0003, END OF TEXT). */
export const HIGHLIGHT_STOP = "\u0003";

export const SEARCH_QUERY_EMPTY = "Type something to search for.";
export const SEARCH_QUERY_TOO_LONG = `Keep the search to ${SEARCH_QUERY_MAX} characters.`;

/** One run of text, highlighted when it matched the search. */
export type HighlightPart = { text: string; highlighted: boolean };

/**
 * Splits `ts_headline` output on the highlight delimiters. Text outside a
 * START…STOP pair is plain; a stray delimiter is dropped rather than
 * shown. Empty runs are left out, and neighbouring runs of the same kind
 * are joined.
 */
export function splitHighlights(text: string): HighlightPart[] {
  const parts: HighlightPart[] = [];
  let highlighted = false;
  let run = "";
  const flush = () => {
    if (!run) return;
    const last = parts.at(-1);
    if (last && last.highlighted === highlighted) last.text += run;
    else parts.push({ text: run, highlighted });
    run = "";
  };
  for (const character of text) {
    if (character === HIGHLIGHT_START || character === HIGHLIGHT_STOP) {
      flush();
      highlighted = character === HIGHLIGHT_START;
      continue;
    }
    run += character;
  }
  flush();
  return parts;
}

/** The text with the highlight delimiters removed. */
export function withoutHighlights(text: string): string {
  return splitHighlights(text)
    .map((part) => part.text)
    .join("");
}
