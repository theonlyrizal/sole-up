import { Fragment } from "react";

import { splitHighlights } from "@/lib/search";

/**
 * Search highlights (chunk 8.4): `ts_headline` output split on the private
 * delimiters, matches as `<mark>`. Every run is a React text child, never
 * HTML, so stored markup shows as the text it is.
 */
export function Highlighted({ text }: { text: string }) {
  return splitHighlights(text).map((part, index) =>
    part.highlighted ? (
      <mark
        key={index}
        className="rounded-sm bg-accent/20 font-semibold text-fg"
      >
        {part.text}
      </mark>
    ) : (
      <Fragment key={index}>{part.text}</Fragment>
    ),
  );
}
