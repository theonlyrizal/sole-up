import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { HIGHLIGHT_START as S, HIGHLIGHT_STOP as E } from "@/lib/search";

import { Highlighted } from "./highlighted";

// Highlights are React text and <mark> elements only, so stored text that
// looks like markup is escaped, never inserted as HTML.

const render = (text: string) =>
  renderToStaticMarkup(<Highlighted text={text} />);

const MARK = '<mark class="rounded-sm bg-accent/20 font-semibold text-fg">';

describe("Highlighted", () => {
  it("renders matches as <mark> and the rest as text", () => {
    expect(render(`Went ${S}running${E} at dawn`)).toBe(
      `Went ${MARK}running</mark> at dawn`,
    );
  });

  it("escapes markup in the text and in a match", () => {
    expect(
      render(`<img src=x onerror=alert(1)> ${S}<b>run</b>${E} <script>`),
    ).toBe(
      `&lt;img src=x onerror=alert(1)&gt; ${MARK}&lt;b&gt;run&lt;/b&gt;</mark> &lt;script&gt;`,
    );
  });

  it("renders nothing for empty text, and drops stray delimiters", () => {
    expect(render("")).toBe("");
    expect(render(`a${E}b`)).toBe("ab");
  });
});
