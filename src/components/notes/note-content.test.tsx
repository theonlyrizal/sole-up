import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { NoteDocument } from "@/lib/notes/document";

import { NoteContent } from "./note-content";

// The read-only renderer builds React elements only, so stored text that
// looks like markup is escaped, and anything outside the allowlist (which
// the server never stores) renders as nothing or as plain text.

function render(document: unknown) {
  return renderToStaticMarkup(
    <NoteContent document={document as NoteDocument} />,
  );
}

const paragraph = (text: string) => ({
  type: "paragraph",
  content: [{ type: "text", text }],
});

describe("NoteContent", () => {
  it("renders every allowed node and mark", () => {
    const html = render({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Plan" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Bold", marks: [{ type: "bold" }] },
            { type: "hardBreak" },
            {
              type: "text",
              text: "all",
              marks: [
                { type: "italic" },
                {
                  type: "link",
                  attrs: {
                    href: "https://example.com/?a=1&b=2",
                    target: "_blank",
                    rel: "noopener noreferrer nofollow",
                    class: null,
                    title: null,
                  },
                },
                { type: "strike" },
                { type: "code" },
              ],
            },
          ],
        },
        {
          type: "codeBlock",
          attrs: { language: "ts" },
          content: [{ type: "text", text: "a < b" }],
        },
        { type: "horizontalRule" },
        { type: "blockquote", content: [paragraph("Quoted")] },
        {
          type: "bulletList",
          content: [{ type: "listItem", content: [paragraph("One")] }],
        },
        {
          type: "orderedList",
          attrs: { start: 3, type: "a" },
          content: [{ type: "listItem", content: [paragraph("Three")] }],
        },
      ],
    });
    expect(html).toBe(
      '<article class="note-content" aria-label="Note">' +
        '<h2 class="note-h1">Plan</h2>' +
        "<p><strong>Bold</strong><br/>" +
        '<a href="https://example.com/?a=1&amp;b=2" target="_blank" rel="noopener noreferrer">' +
        "<code><s><em>all</em></s></code></a></p>" +
        "<pre><code>a &lt; b</code></pre>" +
        "<hr/>" +
        "<blockquote><p>Quoted</p></blockquote>" +
        "<ul><li><p>One</p></li></ul>" +
        '<ol start="3" type="a"><li><p>Three</p></li></ol>' +
        "</article>",
    );
  });

  it("renders stored markup as text", () => {
    const html = render({
      type: "doc",
      content: [
        paragraph('<script>alert("x")</script>'),
        paragraph("<img src=x onerror=alert(1)>"),
      ],
    });
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "java\tscript:alert(1)",
  ])("renders a link to %s as plain text", (href) => {
    const html = render({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "click",
              marks: [{ type: "link", attrs: { href } }],
            },
          ],
        },
      ],
    });
    expect(html).toBe(
      '<article class="note-content" aria-label="Note"><p>click</p></article>',
    );
  });

  it("renders nothing for nodes and marks outside the allowlist", () => {
    const html = render({
      type: "doc",
      content: [
        { type: "image", attrs: { src: "x", onerror: "alert(1)" } },
        { type: "html", content: "<script>alert(1)</script>" },
        {
          type: "paragraph",
          attrs: { style: "color:red", onclick: "alert(1)" },
          content: [
            {
              type: "text",
              text: "kept",
              marks: [{ type: "textStyle", attrs: { style: "x" } }],
            },
            { type: "mention", attrs: { id: "x" } },
          ],
        },
      ],
    });
    expect(html).toBe(
      '<article class="note-content" aria-label="Note"><p>kept</p></article>',
    );
  });
});
