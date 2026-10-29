import { describe, expect, it } from "vitest";

import {
  codePointLength,
  documentDepth,
  documentsEqual,
  EMPTY_NOTE_DOCUMENT,
  isAllowedLinkHref,
  NOTE_BODY_TEXT_TOO_LONG,
  NOTE_DOCUMENT_INVALID,
  NOTE_DOCUMENT_MAX_BYTES,
  NOTE_DOCUMENT_MAX_DEPTH,
  NOTE_DOCUMENT_TOO_DEEP,
  NOTE_DOCUMENT_TOO_LARGE,
  NOTE_LINK_INVALID,
  noteDocumentProblem,
  noteDocumentSchema,
  toBodyText,
  type NoteDocument,
} from "./document";
import { NOTE_BODY_TEXT_MAX } from "./note";

const paragraph = (...content: unknown[]) => ({ type: "paragraph", content });
const text = (value: string, marks?: unknown[]) =>
  marks ? { type: "text", text: value, marks } : { type: "text", text: value };
const doc = (...content: unknown[]) => ({ type: "doc", content });
const link = (href: string, extra: Record<string, unknown> = {}) => ({
  type: "link",
  attrs: { href, ...extra },
});

/** A document whose node depth is exactly `depth`, via nested quotes. */
function nested(depth: number): unknown {
  // doc (1) > blockquote … > paragraph > text (depth)
  let node: unknown = paragraph(text("deep"));
  for (let level = 3; level < depth; level++) {
    node = { type: "blockquote", content: [node] };
  }
  return doc(node);
}

// Everything the TipTap editor produces for the allowlist, with the
// attributes it writes by default (StarterKit + Link, 3.x).
const FULL: NoteDocument = {
  type: "doc",
  content: [
    {
      type: "heading",
      attrs: { level: 1 },
      content: [{ type: "text", text: "Plan" }],
    },
    { type: "heading", attrs: { level: 3 } },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Bold", marks: [{ type: "bold" }] },
        { type: "hardBreak" },
        {
          type: "text",
          text: "both",
          marks: [{ type: "italic" }, { type: "strike" }],
        },
        { type: "text", text: "x()", marks: [{ type: "code" }] },
        {
          type: "text",
          text: "site",
          marks: [
            {
              type: "link",
              attrs: {
                href: "https://example.com/a?b=c#d",
                target: "_blank",
                rel: "noopener noreferrer nofollow",
                class: null,
                title: null,
              },
            },
          ],
        },
        {
          type: "text",
          text: "mail",
          marks: [{ type: "link", attrs: { href: "mailto:me@example.com" } }],
        },
      ],
    },
    { type: "paragraph" },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "one" }] },
            {
              type: "orderedList",
              attrs: { start: 3, type: null },
              content: [
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "nested" }],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "blockquote",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "quoted" }] },
      ],
    },
    {
      type: "codeBlock",
      attrs: { language: "ts" },
      content: [{ type: "text", text: "const a = 1;\nconst b = 2;" }],
    },
    { type: "codeBlock", attrs: { language: null } },
    { type: "horizontalRule" },
  ],
};

describe("noteDocumentSchema accepts the allowlist", () => {
  it("takes every allowed node, mark and attribute", () => {
    expect(noteDocumentProblem(FULL)).toBeNull();
    expect(noteDocumentSchema.parse(FULL)).toEqual(FULL);
  });

  it("takes the editor's empty document", () => {
    expect(noteDocumentProblem(EMPTY_NOTE_DOCUMENT)).toBeNull();
  });

  it("takes http and plain links without the optional attributes", () => {
    const value = doc(paragraph(text("a", [link("http://example.com")])));
    expect(noteDocumentProblem(value)).toBeNull();
  });
});

describe("noteDocumentSchema refuses anything else", () => {
  const refusals: [string, unknown, string][] = [
    ["not an object", "<p>hi</p>", NOTE_DOCUMENT_INVALID],
    ["null", null, NOTE_DOCUMENT_INVALID],
    ["a top node that isn't doc", paragraph(text("a")), NOTE_DOCUMENT_INVALID],
    ["an empty doc", doc(), NOTE_DOCUMENT_INVALID],
    [
      "an unknown node (image)",
      doc({ type: "image", attrs: { src: "https://example.com/x.png" } }),
      NOTE_DOCUMENT_INVALID,
    ],
    [
      "an unknown node (taskList)",
      doc({ type: "taskList", content: [] }),
      NOTE_DOCUMENT_INVALID,
    ],
    [
      "a raw HTML node",
      doc({ type: "html", content: "<script>alert(1)</script>" }),
      NOTE_DOCUMENT_INVALID,
    ],
    [
      "an unknown mark",
      doc(paragraph(text("a", [{ type: "underline" }]))),
      NOTE_DOCUMENT_INVALID,
    ],
    [
      "a textStyle colour",
      doc(
        paragraph(text("a", [{ type: "textStyle", attrs: { color: "red" } }])),
      ),
      NOTE_DOCUMENT_INVALID,
    ],
    [
      "an on* attribute on a node",
      doc({ type: "paragraph", attrs: { onclick: "alert(1)" } }),
      NOTE_DOCUMENT_INVALID,
    ],
    [
      "a style attribute on a node",
      doc({
        type: "heading",
        attrs: { level: 1, style: "color:red" },
      }),
      NOTE_DOCUMENT_INVALID,
    ],
    [
      "an on* attribute on a link",
      doc(
        paragraph(
          text("a", [link("https://example.com", { onmouseover: "x()" })]),
        ),
      ),
      NOTE_DOCUMENT_INVALID,
    ],
    [
      "a class on a link",
      doc(paragraph(text("a", [link("https://example.com", { class: "x" })]))),
      NOTE_DOCUMENT_INVALID,
    ],
    [
      "an unknown rel token",
      doc(
        paragraph(text("a", [link("https://example.com", { rel: "opener" })])),
      ),
      NOTE_DOCUMENT_INVALID,
    ],
    [
      "an extra key on a node",
      doc({ type: "horizontalRule", html: "<hr onload=x>" }),
      NOTE_DOCUMENT_INVALID,
    ],
    [
      "heading level 4",
      doc({ type: "heading", attrs: { level: 4 } }),
      NOTE_DOCUMENT_INVALID,
    ],
    [
      "a list item outside a list",
      doc({ type: "listItem", content: [paragraph(text("a"))] }),
      NOTE_DOCUMENT_INVALID,
    ],
    [
      "a block inside a paragraph",
      doc(paragraph({ type: "horizontalRule" })),
      NOTE_DOCUMENT_INVALID,
    ],
    [
      "marks inside a code block",
      doc({
        type: "codeBlock",
        content: [text("a", [{ type: "bold" }])],
      }),
      NOTE_DOCUMENT_INVALID,
    ],
    ["empty text", doc(paragraph(text(""))), NOTE_DOCUMENT_INVALID],
    [
      "a mark repeated",
      doc(paragraph(text("a", [{ type: "bold" }, { type: "bold" }]))),
      NOTE_DOCUMENT_INVALID,
    ],
    [
      "a javascript: link",
      doc(paragraph(text("a", [link("javascript:alert(1)")]))),
      NOTE_LINK_INVALID,
    ],
    [
      "a data: link",
      doc(paragraph(text("a", [link("data:text/html,<script>x</script>")]))),
      NOTE_LINK_INVALID,
    ],
    [
      "a link without an href",
      doc(paragraph(text("a", [{ type: "link", attrs: {} }]))),
      NOTE_DOCUMENT_INVALID,
    ],
  ];

  it.each(refusals)("refuses %s", (_name, value, message) => {
    expect(noteDocumentProblem(value)).toBe(message);
    const result = noteDocumentSchema.safeParse(value);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      message,
    ]);
  });

  it("never echoes the input in its message", () => {
    const result = noteDocumentSchema.safeParse(
      doc({ type: "Secret-node-name" }),
    );
    expect(JSON.stringify(result.error?.issues)).not.toContain("Secret");
  });
});

describe("isAllowedLinkHref", () => {
  it.each([
    "https://example.com",
    "http://localhost:3000/a",
    "mailto:someone@example.com?subject=Hi%20there",
  ])("allows %s", (href) => {
    expect(isAllowedLinkHref(href)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "\u0000javascript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "file:///etc/passwd",
    "ftp://example.com",
    "/relative/path",
    "//example.com",
    "example.com",
    "https://exa mple.com",
    "",
  ])("refuses %j", (href) => {
    expect(isAllowedLinkHref(href)).toBe(false);
  });

  it("refuses an href over 2,048 characters", () => {
    const base = "https://example.com/";
    expect(isAllowedLinkHref(base + "a".repeat(2048 - base.length))).toBe(true);
    expect(isAllowedLinkHref(base + "a".repeat(2049 - base.length))).toBe(
      false,
    );
  });
});

describe("depth and size limits", () => {
  it("counts doc as level 1", () => {
    expect(documentDepth(nested(3))).toBe(3);
    expect(documentDepth(nested(NOTE_DOCUMENT_MAX_DEPTH))).toBe(
      NOTE_DOCUMENT_MAX_DEPTH,
    );
  });

  it("allows 20 levels and refuses 21", () => {
    expect(noteDocumentProblem(nested(NOTE_DOCUMENT_MAX_DEPTH))).toBeNull();
    expect(noteDocumentProblem(nested(NOTE_DOCUMENT_MAX_DEPTH + 1))).toBe(
      NOTE_DOCUMENT_TOO_DEEP,
    );
  });

  it("refuses a hostile depth without overflowing the stack", () => {
    expect(noteDocumentProblem(nested(100_000))).toBe(NOTE_DOCUMENT_TOO_DEEP);
  });

  it("refuses more than 512 KB of JSON", () => {
    // Under the text limit, but heavy in marks.
    const marked = text("a", [
      { type: "bold" },
      { type: "italic" },
      { type: "strike" },
    ]);
    const size = JSON.stringify(marked).length + 1;
    const count = Math.ceil(NOTE_DOCUMENT_MAX_BYTES / size) + 10;
    const value = doc(
      paragraph(...Array.from({ length: count }, () => marked)),
    );
    expect(noteDocumentProblem(value)).toBe(NOTE_DOCUMENT_TOO_LARGE);
  });

  it("counts bytes, not characters", () => {
    // 4 bytes per emoji in UTF-8: under 512 K characters, over 512 KB.
    const value = doc(paragraph(text("😀".repeat(140_000))));
    expect(JSON.stringify(value).length).toBeLessThan(NOTE_DOCUMENT_MAX_BYTES);
    expect(noteDocumentProblem(value)).toBe(NOTE_DOCUMENT_TOO_LARGE);
  });

  it("refuses body text over 100,000 characters, counted in code points", () => {
    const atLimit = doc(paragraph(text("a".repeat(NOTE_BODY_TEXT_MAX))));
    expect(noteDocumentProblem(atLimit)).toBeNull();
    const over = doc(paragraph(text("a".repeat(NOTE_BODY_TEXT_MAX + 1))));
    expect(noteDocumentProblem(over)).toBe(NOTE_BODY_TEXT_TOO_LONG);
    expect(codePointLength("😀a")).toBe(2);
  });
});

describe("toBodyText", () => {
  it("puts each block on its own line and leaves out blank ones", () => {
    expect(toBodyText(FULL)).toBe(
      [
        "Plan",
        "Bold\nbothx()sitemail",
        "one",
        "nested",
        "quoted",
        "const a = 1;\nconst b = 2;",
      ].join("\n"),
    );
  });

  it("is empty for the empty document and whitespace-only text", () => {
    expect(toBodyText(EMPTY_NOTE_DOCUMENT)).toBe("");
    expect(
      toBodyText(
        doc(paragraph(text("   ")), {
          type: "horizontalRule",
        }) as NoteDocument,
      ),
    ).toBe("");
  });

  it("removes control characters but keeps tabs and newlines", () => {
    const value = doc(
      paragraph(text("a\u0000b\u0001c\u0002d\u001fe\u007ff\u009fg\th\rI")),
      { type: "codeBlock", content: [text("x\ny")] },
    ) as NoteDocument;
    expect(toBodyText(value)).toBe("abcdefg\thI\nx\ny");
  });

  it("keeps markup as plain text", () => {
    const value = doc(
      paragraph(text("<script>alert(1)</script> <img src=x onerror=y>")),
    ) as NoteDocument;
    expect(toBodyText(value)).toBe(
      "<script>alert(1)</script> <img src=x onerror=y>",
    );
  });
});

describe("documentsEqual", () => {
  it("ignores key order", () => {
    const a = doc(
      paragraph(text("a", [link("https://example.com", { rel: null })])),
    ) as NoteDocument;
    const b = {
      content: [
        {
          content: [
            {
              marks: [
                {
                  attrs: { rel: null, href: "https://example.com" },
                  type: "link",
                },
              ],
              text: "a",
              type: "text",
            },
          ],
          type: "paragraph",
        },
      ],
      type: "doc",
    } as NoteDocument;
    expect(documentsEqual(a, b)).toBe(true);
  });

  it("sees a formatting-only change", () => {
    const plain = doc(paragraph(text("a"))) as NoteDocument;
    const bold = doc(paragraph(text("a", [{ type: "bold" }]))) as NoteDocument;
    expect(documentsEqual(plain, bold)).toBe(false);
  });
});
