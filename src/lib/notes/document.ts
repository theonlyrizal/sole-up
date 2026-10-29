// A note's body: the editor's JSON document, limited to one allowlist of
// node and mark types (ADR 0016 "Format"). Pure: no server-only imports, so
// the server's validation and 8.2's editor and renderer share this list.
//
// The server refuses anything outside it rather than fixing it: an unknown
// type or attribute, a link that isn't http:, https: or mailto:, nesting
// deeper than NOTE_DOCUMENT_MAX_DEPTH, or more than NOTE_DOCUMENT_MAX_BYTES of
// JSON. No HTML string is ever accepted, stored or rendered.

import { z } from "zod";

import { NOTE_BODY_TEXT_MAX } from "./note";

export const NOTE_NODE_TYPES = [
  "doc",
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "horizontalRule",
  "hardBreak",
  "text",
] as const;
export type NoteNodeType = (typeof NOTE_NODE_TYPES)[number];

export const NOTE_MARK_TYPES = [
  "bold",
  "italic",
  "strike",
  "code",
  "link",
] as const;
export type NoteMarkType = (typeof NOTE_MARK_TYPES)[number];

export const NOTE_HEADING_LEVELS = [1, 2, 3] as const;
export type NoteHeadingLevel = (typeof NOTE_HEADING_LEVELS)[number];

/** The only schemes a link may use, as `URL.protocol` spells them. */
export const NOTE_LINK_PROTOCOLS = ["http:", "https:", "mailto:"] as const;

/** A link's `href` holds up to this many characters. */
export const NOTE_LINK_HREF_MAX = 2048;

/** Nodes nest at most this deep, counting `doc` as 1. */
export const NOTE_DOCUMENT_MAX_DEPTH = 20;

/** A body's JSON holds at most this many bytes (UTF-8). */
export const NOTE_DOCUMENT_MAX_BYTES = 512 * 1024;

/** `orderedList.attrs.type`: the list markers HTML's `<ol type>` takes. */
export const NOTE_ORDERED_LIST_MARKERS = ["1", "a", "A", "i", "I"] as const;

/** `orderedList.attrs.start` is a whole number from 0 up to this. */
export const NOTE_ORDERED_LIST_START_MAX = 1_000_000;

/** `codeBlock.attrs.language`: a short name such as `ts` or `c++`. */
const CODE_LANGUAGE_PATTERN = /^[A-Za-z0-9+#._-]{1,32}$/;

export function isAllowedCodeLanguage(language: string): boolean {
  return CODE_LANGUAGE_PATTERN.test(language);
}

/** `link.attrs.rel` may only combine these tokens. */
const LINK_REL_TOKENS = new Set(["noopener", "noreferrer", "nofollow"]);

export const NOTE_DOCUMENT_INVALID =
  "This note has content or formatting that can't be saved.";
export const NOTE_LINK_INVALID =
  "Links must start with http://, https:// or mailto: and be up to 2,048 characters.";
export const NOTE_DOCUMENT_TOO_DEEP = "This note is nested too deeply to save.";
export const NOTE_DOCUMENT_TOO_LARGE = "This note is too large to save.";
export const NOTE_BODY_TEXT_TOO_LONG = `Keep a note to ${NOTE_BODY_TEXT_MAX.toLocaleString("en-US")} characters or fewer.`;

// Types, matching the ProseMirror JSON the editor produces for the
// allowlist. Optional `attrs` are the editor's attributes with defaults.

export type NoteLinkAttrs = {
  href: string;
  target?: "_blank" | null;
  rel?: string | null;
  class?: null;
  title?: null;
};

export type NoteMark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "strike" }
  | { type: "code" }
  | { type: "link"; attrs: NoteLinkAttrs };

export type NoteTextNode = { type: "text"; text: string; marks?: NoteMark[] };
export type NoteHardBreakNode = { type: "hardBreak" };
export type NoteInlineNode = NoteTextNode | NoteHardBreakNode;

export type NoteParagraphNode = {
  type: "paragraph";
  content?: NoteInlineNode[];
};
export type NoteHeadingNode = {
  type: "heading";
  attrs: { level: NoteHeadingLevel };
  content?: NoteInlineNode[];
};
/** Code is plain text: no marks and no hard breaks (newlines are text). */
export type NoteCodeBlockNode = {
  type: "codeBlock";
  attrs?: { language?: string | null };
  content?: { type: "text"; text: string }[];
};
export type NoteHorizontalRuleNode = { type: "horizontalRule" };
export type NoteBlockquoteNode = {
  type: "blockquote";
  content: NoteBlockNode[];
};
export type NoteListItemNode = { type: "listItem"; content: NoteBlockNode[] };
export type NoteBulletListNode = {
  type: "bulletList";
  content: NoteListItemNode[];
};
export type NoteOrderedListNode = {
  type: "orderedList";
  attrs?: {
    start?: number;
    type?: (typeof NOTE_ORDERED_LIST_MARKERS)[number] | null;
  };
  content: NoteListItemNode[];
};
export type NoteBlockNode =
  | NoteParagraphNode
  | NoteHeadingNode
  | NoteCodeBlockNode
  | NoteHorizontalRuleNode
  | NoteBlockquoteNode
  | NoteBulletListNode
  | NoteOrderedListNode;

export type NoteDocument = { type: "doc"; content: NoteBlockNode[] };

/** The editor's empty document: one empty paragraph. */
export const EMPTY_NOTE_DOCUMENT: NoteDocument = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

/**
 * True for an absolute http:, https: or mailto: URL of up to
 * NOTE_LINK_HREF_MAX characters, with no whitespace or control characters
 * (which URL parsing would strip, so `java\tscript:` can't pass).
 */
export function isAllowedLinkHref(href: string): boolean {
  if (href.length === 0 || href.length > NOTE_LINK_HREF_MAX) return false;
  if (/[\u0000- \u007f-\u009f]/.test(href)) return false;
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return false;
  }
  return (NOTE_LINK_PROTOCOLS as readonly string[]).includes(url.protocol);
}

function isAllowedLinkRel(rel: string): boolean {
  const tokens = rel.split(" ");
  return tokens.every((token) => LINK_REL_TOKENS.has(token));
}

// Schemas. Every object is strict, so any attribute outside the allowlist
// (an `on*` handler, `style`, `class`) is refused.

const textValue = z.string().min(1);

const linkAttrsSchema = z.strictObject({
  href: z.string().refine(isAllowedLinkHref, NOTE_LINK_INVALID),
  target: z.literal("_blank").nullable().optional(),
  rel: z.string().refine(isAllowedLinkRel).nullable().optional(),
  class: z.null().optional(),
  title: z.null().optional(),
});

const markSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("bold") }),
  z.strictObject({ type: z.literal("italic") }),
  z.strictObject({ type: z.literal("strike") }),
  z.strictObject({ type: z.literal("code") }),
  z.strictObject({ type: z.literal("link"), attrs: linkAttrsSchema }),
]);

const textNodeSchema = z.strictObject({
  type: z.literal("text"),
  text: textValue,
  marks: z
    .array(markSchema)
    .min(1)
    .refine(
      (marks) => new Set(marks.map((mark) => mark.type)).size === marks.length,
    )
    .optional(),
});

const inlineSchema = z.discriminatedUnion("type", [
  textNodeSchema,
  z.strictObject({ type: z.literal("hardBreak") }),
]);

const inlineContent = z.array(inlineSchema).optional();

const blockSchema: z.ZodType<NoteBlockNode> = z.lazy(() =>
  z.discriminatedUnion("type", [
    z.strictObject({ type: z.literal("paragraph"), content: inlineContent }),
    z.strictObject({
      type: z.literal("heading"),
      attrs: z.strictObject({ level: z.literal(NOTE_HEADING_LEVELS) }),
      content: inlineContent,
    }),
    z.strictObject({
      type: z.literal("codeBlock"),
      attrs: z
        .strictObject({
          language: z
            .string()
            .regex(CODE_LANGUAGE_PATTERN)
            .nullable()
            .optional(),
        })
        .optional(),
      content: z
        .array(z.strictObject({ type: z.literal("text"), text: textValue }))
        .optional(),
    }),
    z.strictObject({ type: z.literal("horizontalRule") }),
    z.strictObject({
      type: z.literal("blockquote"),
      content: z.array(blockSchema).min(1),
    }),
    z.strictObject({
      type: z.literal("bulletList"),
      content: z.array(listItemSchema).min(1),
    }),
    z.strictObject({
      type: z.literal("orderedList"),
      attrs: z
        .strictObject({
          start: z
            .number()
            .int()
            .min(0)
            .max(NOTE_ORDERED_LIST_START_MAX)
            .optional(),
          type: z.enum(NOTE_ORDERED_LIST_MARKERS).nullable().optional(),
        })
        .optional(),
      content: z.array(listItemSchema).min(1),
    }),
  ]),
);

const listItemSchema: z.ZodType<NoteListItemNode> = z.strictObject({
  type: z.literal("listItem"),
  content: z.array(blockSchema).min(1),
});

const documentStructureSchema: z.ZodType<NoteDocument> = z.strictObject({
  type: z.literal("doc"),
  content: z.array(blockSchema).min(1),
});

/**
 * How deeply `value`'s nodes nest through their `content` arrays, counting
 * the top as 1. Iterative, so a hostile document can't overflow the stack
 * before it is refused.
 */
export function documentDepth(value: unknown): number {
  let deepest = 0;
  const stack: [unknown, number][] = [[value, 1]];
  while (stack.length > 0) {
    const [node, depth] = stack.pop()!;
    deepest = Math.max(deepest, depth);
    if (depth > NOTE_DOCUMENT_MAX_DEPTH) return depth;
    if (typeof node !== "object" || node === null) continue;
    const content = (node as { content?: unknown }).content;
    if (Array.isArray(content)) {
      for (const child of content) stack.push([child, depth + 1]);
    }
  }
  return deepest;
}

/** The UTF-8 size of `value` as JSON, or Infinity if it can't be written. */
export function documentBytes(value: unknown): number {
  try {
    const json = JSON.stringify(value);
    return json === undefined ? 0 : new TextEncoder().encode(json).length;
  } catch {
    return Infinity;
  }
}

const CONTROL_CHARACTERS = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g;

function inlineText(content: readonly NoteInlineNode[] | undefined): string {
  return (content ?? [])
    .map((node) => (node.type === "text" ? node.text : "\n"))
    .join("");
}

/**
 * The plain text of a validated document, for search, previews and the
 * length limit: each paragraph, heading and code block on its own line(s)
 * (a hard break is a line break too), blank lines left out, and control
 * characters other than tab and newline removed.
 */
export function toBodyText(document: NoteDocument): string {
  const lines: string[] = [];
  const visit = (node: NoteBlockNode | NoteListItemNode) => {
    switch (node.type) {
      case "paragraph":
      case "heading":
      case "codeBlock": {
        const text = inlineText(node.content).replace(CONTROL_CHARACTERS, "");
        if (text.trim() !== "") lines.push(text);
        return;
      }
      case "horizontalRule":
        return;
      case "blockquote":
      case "bulletList":
      case "orderedList":
      case "listItem":
        node.content.forEach(visit);
        return;
    }
  };
  document.content.forEach(visit);
  return lines.join("\n");
}

/** Length in code points, as Postgres's `char_length` counts it. */
export function codePointLength(text: string): number {
  return Array.from(text).length;
}

/**
 * Why `value` isn't an allowed note body, as one fixed message, or null
 * when it is. Depth and size are checked first, so the recursive schema only
 * ever sees a bounded document.
 */
export function noteDocumentProblem(value: unknown): string | null {
  if (documentDepth(value) > NOTE_DOCUMENT_MAX_DEPTH) {
    return NOTE_DOCUMENT_TOO_DEEP;
  }
  if (documentBytes(value) > NOTE_DOCUMENT_MAX_BYTES) {
    return NOTE_DOCUMENT_TOO_LARGE;
  }
  const result = documentStructureSchema.safeParse(value);
  if (!result.success) {
    const badLink = result.error.issues.some(
      (issue) => issue.message === NOTE_LINK_INVALID,
    );
    return badLink ? NOTE_LINK_INVALID : NOTE_DOCUMENT_INVALID;
  }
  if (codePointLength(toBodyText(result.data)) > NOTE_BODY_TEXT_MAX) {
    return NOTE_BODY_TEXT_TOO_LONG;
  }
  return null;
}

/**
 * A note body from untrusted input, refused with one of the fixed messages
 * above (never Zod's own, which can echo the input).
 */
export const noteDocumentSchema = z
  .unknown()
  .superRefine((value, ctx) => {
    const problem = noteDocumentProblem(value);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  })
  .transform((value) => value as NoteDocument);

/** Stable JSON for comparing two documents whatever their key order. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    const entries = Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** True when two documents hold the same nodes, marks and attributes. */
export function documentsEqual(a: NoteDocument, b: NoteDocument): boolean {
  return canonicalJson(a) === canonicalJson(b);
}
