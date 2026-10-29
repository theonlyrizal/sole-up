// The note editor's schema: TipTap's StarterKit cut down to exactly the
// 8.1 allowlist in src/lib/notes/document.ts (ADR 0016 "Format"), so
// whatever is typed, pasted or dropped can only become nodes, marks and
// attribute values the server accepts. Anything else in pasted HTML is
// dropped by ProseMirror's parser: an <img>, a <script>, an h4 (a
// paragraph), a `javascript:` link (plain text).
//
// StarterKit's own attribute parsers read pasted HTML as is, so the
// attributes the allowlist limits are re-parsed here: a link's `target`,
// `rel`, `class` and `title` are fixed, and a code block's language and an
// ordered list's `start` and `type` keep only allowed values.

import type { AnyExtension, Attributes } from "@tiptap/core";
import { StarterKit } from "@tiptap/starter-kit";

import {
  NOTE_HEADING_LEVELS,
  NOTE_ORDERED_LIST_MARKERS,
  NOTE_ORDERED_LIST_START_MAX,
  isAllowedCodeLanguage,
  isAllowedLinkHref,
} from "@/lib/notes/document";

/** What every link carries: it opens in a new tab and passes nothing on. */
export const NOTE_LINK_TARGET = "_blank";
export const NOTE_LINK_REL = "noopener noreferrer nofollow";

/** A pasted code block's language, kept only if the allowlist takes it. */
export function allowedCodeLanguage(language: unknown): string | null {
  return typeof language === "string" && isAllowedCodeLanguage(language)
    ? language
    : null;
}

/** A pasted ordered list's `start`, or 1 when it isn't allowed. */
export function allowedListStart(start: unknown): number {
  return typeof start === "number" &&
    Number.isInteger(start) &&
    start >= 0 &&
    start <= NOTE_ORDERED_LIST_START_MAX
    ? start
    : 1;
}

/** A pasted ordered list's marker type, or null when it isn't allowed. */
export function allowedListMarker(type: unknown): string | null {
  return typeof type === "string" &&
    (NOTE_ORDERED_LIST_MARKERS as readonly string[]).includes(type)
    ? type
    : null;
}

type AttributeParser = (element: HTMLElement) => unknown;

/** `attribute` with its HTML parser's result passed through `allow`. */
function restricted(
  attributes: Attributes,
  name: string,
  allow: (value: unknown) => unknown,
): Attributes[string] {
  const attribute = attributes[name];
  if (!attribute) throw new Error(`StarterKit has no ${name} attribute`);
  const parse = attribute.parseHTML as AttributeParser | undefined;
  return {
    ...attribute,
    parseHTML: (element: HTMLElement) =>
      allow(parse ? parse(element) : element.getAttribute(name)),
  };
}

/** Attribute rules per extension name, applied over StarterKit's own. */
const ATTRIBUTE_RULES: Record<string, (parent: Attributes) => Attributes> = {
  link: (parent) => ({
    ...parent,
    target: { default: NOTE_LINK_TARGET, parseHTML: () => NOTE_LINK_TARGET },
    rel: { default: NOTE_LINK_REL, parseHTML: () => NOTE_LINK_REL },
    class: { default: null, parseHTML: () => null },
    title: { default: null, parseHTML: () => null },
  }),
  codeBlock: (parent) => ({
    ...parent,
    language: restricted(parent, "language", allowedCodeLanguage),
  }),
  orderedList: (parent) => ({
    ...parent,
    start: restricted(parent, "start", allowedListStart),
    type: restricted(parent, "type", allowedListMarker),
  }),
};

const NoteStarterKit = StarterKit.extend({
  addExtensions() {
    const extensions: AnyExtension[] = this.parent?.() ?? [];
    return extensions.map((extension) => {
      const rule = ATTRIBUTE_RULES[extension.name];
      if (!rule) return extension;
      return (
        extension as AnyExtension & { extend: AnyExtension["extend"] }
      ).extend({
        addAttributes(this: { parent?: () => Attributes }) {
          return rule(this.parent?.() ?? {});
        },
      }) as AnyExtension;
    });
  },
});

/** The editor's extensions. The schema test checks them against 8.1. */
export const noteEditorExtensions: AnyExtension[] = [
  NoteStarterKit.configure({
    heading: { levels: [...NOTE_HEADING_LEVELS] },
    // Outside the allowlist.
    underline: false,
    codeBlock: { defaultLanguage: null },
    link: {
      // Following a link while editing is a click away from losing focus;
      // the read-only view opens links.
      openOnClick: false,
      autolink: true,
      linkOnPaste: true,
      defaultProtocol: "https",
      isAllowedUri: (url) => isAllowedLinkHref(url),
      HTMLAttributes: {
        target: NOTE_LINK_TARGET,
        rel: NOTE_LINK_REL,
        class: null,
      },
    },
  }),
];
