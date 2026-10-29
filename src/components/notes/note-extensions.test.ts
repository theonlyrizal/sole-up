import { getSchema } from "@tiptap/core";
import { describe, expect, it } from "vitest";

import {
  NOTE_MARK_TYPES,
  NOTE_NODE_TYPES,
  noteDocumentProblem,
} from "@/lib/notes/document";

import {
  NOTE_LINK_REL,
  NOTE_LINK_TARGET,
  allowedCodeLanguage,
  allowedListMarker,
  allowedListStart,
  noteEditorExtensions,
} from "./note-extensions";

// The editor's schema must be exactly the 8.1 allowlist, so nothing the
// editor produces is refused by the server, and nothing outside the list
// can be typed or pasted in.

const schema = getSchema(noteEditorExtensions);

/** A fake element for an attribute's HTML parser. */
function element(attributes: Record<string, string>, classes: string[] = []) {
  return {
    getAttribute: (name: string) => attributes[name] ?? null,
    hasAttribute: (name: string) => name in attributes,
    querySelector: () => null,
    firstElementChild: { classList: classes },
  } as unknown as HTMLElement;
}

function parseAttribute(type: string, name: string, dom: HTMLElement) {
  const spec = (schema.nodes[type] ?? schema.marks[type])!.spec;
  const rule = spec.parseDOM?.find((candidate) => candidate.tag);
  expect(rule).toBeDefined();
  // TipTap injects each attribute's parseHTML into the parse rule, leaving
  // out a null result, so ProseMirror falls back to the default.
  const getAttrs = rule!.getAttrs as (dom: HTMLElement) => unknown;
  const attrs = (getAttrs(dom) ?? {}) as Record<string, unknown>;
  return attrs[name] ?? spec.attrs?.[name]?.default;
}

describe("the note editor's schema", () => {
  it("has exactly the allowlisted node and mark types", () => {
    expect(Object.keys(schema.nodes).sort()).toEqual(
      [...NOTE_NODE_TYPES].sort(),
    );
    expect(Object.keys(schema.marks).sort()).toEqual(
      [...NOTE_MARK_TYPES].sort(),
    );
  });

  it("gives only allowlisted attributes, with allowed defaults", () => {
    const attributes = Object.fromEntries(
      [...Object.entries(schema.nodes), ...Object.entries(schema.marks)]
        .map(([name, type]) => [name, Object.keys(type.spec.attrs ?? {})])
        .filter(([, names]) => names.length > 0),
    );
    expect(attributes).toEqual({
      heading: ["level"],
      codeBlock: ["language"],
      orderedList: ["start", "type"],
      link: ["href", "target", "rel", "class", "title"],
    });

    // A document of every node and mark with default attributes.
    const link = schema.marks.link!.create({ href: "https://example.com" });
    const doc = schema.node("doc", null, [
      schema.node("heading", { level: 3 }, [schema.text("Heading")]),
      schema.node("paragraph", null, [
        schema.text("Linked", [link, schema.marks.bold!.create()]),
        schema.node("hardBreak"),
        schema.text("rest", [
          schema.marks.italic!.create(),
          schema.marks.strike!.create(),
          schema.marks.code!.create(),
        ]),
      ]),
      schema.node("codeBlock", null, [schema.text("const a = 1;")]),
      schema.node("horizontalRule"),
      schema.node("blockquote", null, [schema.node("paragraph")]),
      schema.node("bulletList", null, [
        schema.node("listItem", null, [schema.node("paragraph")]),
      ]),
      schema.node("orderedList", null, [
        schema.node("listItem", null, [schema.node("paragraph")]),
      ]),
    ]);
    expect(noteDocumentProblem(doc.toJSON())).toBeNull();
    expect(link.attrs).toEqual({
      href: "https://example.com",
      target: NOTE_LINK_TARGET,
      rel: NOTE_LINK_REL,
      class: null,
      title: null,
    });
  });

  it("allows heading levels 1 to 3 only", () => {
    const tags = schema.nodes
      .heading!.spec.parseDOM!.map((rule) => rule.tag)
      .sort();
    expect(tags).toEqual(["h1", "h2", "h3"]);
  });
});

describe("pasted attributes", () => {
  it("fixes a pasted link's target, rel, class and title", () => {
    const dom = element({
      href: "https://example.com",
      target: "_top",
      rel: "opener",
      class: "evil",
      title: "Hello",
    });
    expect(parseAttribute("link", "target", dom)).toBe(NOTE_LINK_TARGET);
    expect(parseAttribute("link", "rel", dom)).toBe(NOTE_LINK_REL);
    expect(parseAttribute("link", "class", dom)).toBeNull();
    expect(parseAttribute("link", "title", dom)).toBeNull();
  });

  it.each([
    "javascript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "vbscript:msgbox(1)",
    "/relative",
    "java\tscript:alert(1)",
  ])("drops a pasted link to %s", (href) => {
    const rule = schema.marks.link!.spec.parseDOM!.find((r) => r.tag)!;
    const getAttrs = rule.getAttrs as (dom: HTMLElement) => unknown;
    expect(getAttrs(element({ href }))).toBe(false);
  });

  it("keeps a pasted code block's language only when allowed", () => {
    expect(
      parseAttribute("codeBlock", "language", element({}, ["language-ts"])),
    ).toBe("ts");
    expect(
      parseAttribute(
        "codeBlock",
        "language",
        element({}, ["language-<img/src/onerror=alert(1)>"]),
      ),
    ).toBeNull();
    expect(allowedCodeLanguage("c++")).toBe("c++");
    expect(allowedCodeLanguage("x".repeat(33))).toBeNull();
    expect(allowedCodeLanguage(null)).toBeNull();
  });

  it("keeps a pasted ordered list's start and type only when allowed", () => {
    expect(
      parseAttribute("orderedList", "start", element({ start: "3" })),
    ).toBe(3);
    expect(
      parseAttribute("orderedList", "start", element({ start: "-4" })),
    ).toBe(1);
    expect(
      parseAttribute("orderedList", "start", element({ start: "9999999" })),
    ).toBe(1);
    expect(parseAttribute("orderedList", "type", element({ type: "a" }))).toBe(
      "a",
    );
    expect(
      parseAttribute("orderedList", "type", element({ type: "disc" })),
    ).toBeNull();
    expect(allowedListStart(Number.NaN)).toBe(1);
    expect(allowedListStart(0)).toBe(0);
    expect(allowedListMarker("I")).toBe("I");
  });
});
