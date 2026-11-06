import type {
  NoteBlockNode,
  NoteDocument,
  NoteInlineNode,
  NoteMark,
} from "@/lib/notes/document";

function escapeText(text: string): string {
  return text
    .replace(/\r\n?|\n/g, " ")
    .replace(/[\\`*_{}\[\]<>#!~|&]/g, "\\$&")
    .replace(/(^|\s)(\d*)([-+.)])(?=\s|$)/g, "$1$2\\$3");
}

function backticks(text: string, minimum: number): string {
  let size = minimum;
  for (const match of text.matchAll(/`+/g)) {
    size = Math.max(size, match[0].length + 1);
  }
  return "`".repeat(size);
}

const markOrder = ["link", "bold", "italic", "strike", "code"] as const;

function wrapMark(mark: NoteMark, content: string): string {
  switch (mark.type) {
    case "link": {
      const href = mark.attrs.href.replace(/[\\<>]/g, (char) =>
        encodeURIComponent(char),
      );
      return `[${content}](<${href}>)`;
    }
    case "code": {
      const text = content.replace(/\r\n?|\n/g, " ");
      const fence = backticks(text, 1);
      const pad = /^`|`$|^ .*\S.* $/.test(text) ? " " : "";
      return `${fence}${pad}${text}${pad}${fence}`;
    }
    default: {
      const marker = { bold: "**", italic: "_", strike: "~~" }[mark.type];
      return content.replace(
        /^(\s*)(\S[\s\S]*?)(\s*)$/,
        `$1${marker}$2${marker}$3`,
      );
    }
  }
}

// Group adjacent text sharing a mark so a change in inner formatting
// doesn't break a surrounding link or emit adjacent closing/opening markers.
function inlineMarkdown(
  nodes: readonly NoteInlineNode[] = [],
  depth = 0,
): string {
  const type = markOrder[depth];
  if (type === undefined) {
    return nodes
      .map((node) =>
        node.type === "hardBreak" ? "\\\n" : escapeText(node.text),
      )
      .join("");
  }
  const markOf = (node: NoteInlineNode) =>
    node.type === "text"
      ? node.marks?.find((mark) => mark.type === type)
      : undefined;
  const output: string[] = [];
  for (let start = 0; start < nodes.length;) {
    const mark = markOf(nodes[start]);
    const key = mark?.type === "link" ? mark.attrs.href : mark?.type;
    let end = start + 1;
    while (end < nodes.length) {
      const next = markOf(nodes[end]);
      if ((next?.type === "link" ? next.attrs.href : next?.type) !== key) break;
      end++;
    }
    const group = nodes.slice(start, end);
    const content =
      mark?.type === "code"
        ? group.map((node) => (node.type === "text" ? node.text : "")).join("")
        : inlineMarkdown(group, depth + 1);
    output.push(mark ? wrapMark(mark, content) : content);
    start = end;
  }
  return output.join("");
}

function blocksMarkdown(nodes: readonly NoteBlockNode[]): string {
  return nodes.map(blockMarkdown).join("\n\n");
}

function blockMarkdown(node: NoteBlockNode): string {
  switch (node.type) {
    case "paragraph":
      return inlineMarkdown(node.content);
    case "heading":
      return `${"#".repeat(node.attrs.level)} ${inlineMarkdown(node.content)}`;
    case "blockquote":
      return blocksMarkdown(node.content)
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n");
    case "codeBlock": {
      const text = (node.content ?? []).map(({ text }) => text).join("");
      const fence = backticks(text, 3);
      const body = text && !text.endsWith("\n") ? text + "\n" : text;
      return `${fence}${node.attrs?.language ?? ""}\n${body}${fence}`;
    }
    case "horizontalRule":
      return "---";
    case "bulletList":
    case "orderedList":
      return node.content
        .map((item, index) => {
          const marker =
            node.type === "bulletList"
              ? "- "
              : `${(node.attrs?.start ?? 1) + index}. `;
          const [first, ...rest] = blocksMarkdown(item.content).split("\n");
          const indent = " ".repeat(marker.length);
          return [
            marker + first,
            ...rest.map((line) => (line ? indent + line : "")),
          ].join("\n");
        })
        .join("\n");
  }
}

/** Portable rendering of the stored body. The original JSON is authoritative. */
export function noteMarkdown(document: NoteDocument): string {
  return blocksMarkdown(document.content);
}
