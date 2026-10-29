import { Fragment, type ReactNode } from "react";

import {
  isAllowedLinkHref,
  type NoteBlockNode,
  type NoteDocument,
  type NoteInlineNode,
  type NoteListItemNode,
  type NoteMark,
  type NoteTextNode,
} from "@/lib/notes/document";

// A note body, read-only (ADR 0016 "Format"): the stored JSON walked
// through the allowlist into React elements. React escapes every string,
// and no HTML string is ever built or inserted, so text that looks like
// markup stays text. A node or mark outside the list renders nothing, and
// a link whose href isn't allowed renders as plain text, even though the
// server never stores either.

/** Note headings sit under the page's own h1 and the note's title. */
const HEADING_TAGS = { 1: "h2", 2: "h3", 3: "h4" } as const;

export function NoteContent({
  document,
  label = "Note",
}: {
  document: NoteDocument;
  label?: string;
}) {
  return (
    <article className="note-content" aria-label={label}>
      {blocks(document.content)}
    </article>
  );
}

function blocks(
  nodes: readonly (NoteBlockNode | NoteListItemNode)[] | undefined,
): ReactNode {
  return (nodes ?? []).map((node, index) => (
    <Fragment key={index}>{block(node)}</Fragment>
  ));
}

function block(node: NoteBlockNode | NoteListItemNode): ReactNode {
  switch (node.type) {
    case "paragraph":
      return <p>{inline(node.content)}</p>;
    case "heading": {
      const Tag = HEADING_TAGS[node.attrs.level];
      if (!Tag) return <p>{inline(node.content)}</p>;
      return (
        <Tag className={`note-h${node.attrs.level}`}>
          {inline(node.content)}
        </Tag>
      );
    }
    case "codeBlock":
      return (
        <pre>
          <code>{(node.content ?? []).map((text) => text.text).join("")}</code>
        </pre>
      );
    case "horizontalRule":
      return <hr />;
    case "blockquote":
      return <blockquote>{blocks(node.content)}</blockquote>;
    case "bulletList":
      return <ul>{blocks(node.content)}</ul>;
    case "orderedList":
      return (
        <ol start={node.attrs?.start} type={node.attrs?.type ?? undefined}>
          {blocks(node.content)}
        </ol>
      );
    case "listItem":
      return <li>{blocks(node.content)}</li>;
    default:
      return null;
  }
}

function inline(nodes: readonly NoteInlineNode[] | undefined): ReactNode {
  return (nodes ?? []).map((node, index) => {
    if (node.type === "hardBreak") return <br key={index} />;
    if (node.type === "text") {
      return <Fragment key={index}>{text(node)}</Fragment>;
    }
    return null;
  });
}

/** The text with its marks, the link outermost as the editor nests it. */
function text(node: NoteTextNode): ReactNode {
  const marks = [...(node.marks ?? [])].sort(
    (a, b) => Number(a.type === "link") - Number(b.type === "link"),
  );
  return marks.reduce<ReactNode>(
    (children, mark) => withMark(mark, children),
    node.text,
  );
}

function withMark(mark: NoteMark, children: ReactNode): ReactNode {
  switch (mark.type) {
    case "bold":
      return <strong>{children}</strong>;
    case "italic":
      return <em>{children}</em>;
    case "strike":
      return <s>{children}</s>;
    case "code":
      return <code>{children}</code>;
    case "link":
      return isAllowedLinkHref(mark.attrs.href) ? (
        <a href={mark.attrs.href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      ) : (
        children
      );
    default:
      return children;
  }
}
