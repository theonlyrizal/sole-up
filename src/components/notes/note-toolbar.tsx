"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import {
  NOTE_LINK_INVALID,
  isAllowedLinkHref,
  type NoteHeadingLevel,
} from "@/lib/notes/document";

// The formatting toolbar: one labelled button per allowed mark and block,
// each a Tab stop with its keyboard shortcut announced. The shortcuts are
// TipTap's own, plus Mod-K for a link (handled by the editor).

type ToolbarItem = {
  label: string;
  /** What the button shows; the label is what it's called. */
  glyph: string;
  glyphClass?: string;
  shortcut: string;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
};

const heading = (level: NoteHeadingLevel): ToolbarItem => ({
  label: `Heading ${level}`,
  glyph: `H${level}`,
  shortcut: `Control+Alt+${level}`,
  isActive: (editor) => editor.isActive("heading", { level }),
  run: (editor) => editor.chain().focus().toggleHeading({ level }).run(),
});

const MARK_ITEMS: ToolbarItem[] = [
  {
    label: "Bold",
    glyph: "B",
    glyphClass: "font-bold",
    shortcut: "Control+B",
    isActive: (editor) => editor.isActive("bold"),
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    label: "Italic",
    glyph: "I",
    glyphClass: "font-serif italic",
    shortcut: "Control+I",
    isActive: (editor) => editor.isActive("italic"),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    label: "Strikethrough",
    glyph: "S",
    glyphClass: "line-through",
    shortcut: "Control+Shift+S",
    isActive: (editor) => editor.isActive("strike"),
    run: (editor) => editor.chain().focus().toggleStrike().run(),
  },
  {
    label: "Code",
    glyph: "</>",
    glyphClass: "font-mono text-xs",
    shortcut: "Control+E",
    isActive: (editor) => editor.isActive("code"),
    run: (editor) => editor.chain().focus().toggleCode().run(),
  },
];

const BLOCK_ITEMS: ToolbarItem[] = [
  heading(1),
  heading(2),
  heading(3),
  {
    label: "Bulleted list",
    glyph: "•",
    shortcut: "Control+Shift+8",
    isActive: (editor) => editor.isActive("bulletList"),
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    label: "Numbered list",
    glyph: "1.",
    shortcut: "Control+Shift+7",
    isActive: (editor) => editor.isActive("orderedList"),
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    label: "Quote",
    glyph: "“",
    shortcut: "Control+Shift+B",
    isActive: (editor) => editor.isActive("blockquote"),
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    label: "Code block",
    glyph: "{ }",
    shortcut: "Control+Alt+C",
    isActive: (editor) => editor.isActive("codeBlock"),
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
];

const ALL_ITEMS = [...MARK_ITEMS, ...BLOCK_ITEMS];

/**
 * A mouse press on a button would move focus out of the body, losing the
 * selection for a moment; the button still works from the keyboard.
 */
const keepEditorFocus = (event: React.MouseEvent) => event.preventDefault();

const buttonClass = (active: boolean) =>
  cx(
    "min-w-9 rounded-md px-2 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60",
    focusRing,
    active
      ? "bg-surface-muted text-fg ring-1 ring-border"
      : "text-muted hover:bg-surface-muted hover:text-fg",
  );

/** `linkOpen` is the editor's, since Mod-K in the body opens it too. */
export function NoteToolbar({
  editor,
  linkOpen,
  setLinkOpen,
}: {
  editor: Editor | null;
  linkOpen: boolean;
  setLinkOpen: (open: boolean) => void;
}) {
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            items: ALL_ITEMS.map((item) => item.isActive(current)),
            link: current.isActive("link"),
          }
        : null,
  });

  const renderItem = (item: ToolbarItem, index: number) => (
    <button
      key={item.label}
      type="button"
      aria-label={item.label}
      aria-pressed={active?.items[index] ?? false}
      aria-keyshortcuts={item.shortcut}
      title={`${item.label} (${item.shortcut.replace("Control", "Ctrl")})`}
      disabled={!editor}
      onMouseDown={keepEditorFocus}
      onClick={() => editor && item.run(editor)}
      className={buttonClass(active?.items[index] ?? false)}
    >
      <span aria-hidden="true" className={item.glyphClass}>
        {item.glyph}
      </span>
    </button>
  );

  return (
    <div
      role="group"
      aria-label="Formatting"
      className="flex flex-wrap items-center gap-1 rounded-md border border-border bg-surface p-1"
    >
      {MARK_ITEMS.map((item, index) => renderItem(item, index))}
      <button
        type="button"
        aria-label="Link"
        aria-pressed={active?.link ?? false}
        aria-keyshortcuts="Control+K"
        title="Link (Ctrl+K)"
        disabled={!editor}
        onMouseDown={keepEditorFocus}
        onClick={() => setLinkOpen(true)}
        className={buttonClass(active?.link ?? false)}
      >
        <span aria-hidden="true">Link</span>
      </button>
      <span aria-hidden="true" className="mx-1 h-6 w-px bg-border" />
      {BLOCK_ITEMS.map((item, index) =>
        renderItem(item, MARK_ITEMS.length + index),
      )}
      <button
        type="button"
        aria-label="Divider"
        title="Divider"
        disabled={!editor}
        onMouseDown={keepEditorFocus}
        onClick={() => editor?.chain().focus().setHorizontalRule().run()}
        className={buttonClass(false)}
      >
        <span aria-hidden="true">―</span>
      </button>
      {editor && (
        <LinkDialog
          editor={editor}
          open={linkOpen}
          onOpenChange={setLinkOpen}
        />
      )}
    </div>
  );
}

/**
 * Adds, changes or removes the link on the selection. With nothing
 * selected, the address is inserted as linked text. Only http:, https:
 * and mailto: addresses are accepted, as the server requires.
 */
function LinkDialog({
  editor,
  open,
  onOpenChange,
}: {
  editor: Editor;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const id = useId();
  const [href, setHref] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  const hasLink = editor.isActive("link");

  // Start from the current link each time the dialog opens.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setHref((editor.getAttributes("link").href as string | undefined) ?? "");
      setError(null);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const address = href.trim();
    if (!isAllowedLinkHref(address)) {
      setError(NOTE_LINK_INVALID);
      return;
    }
    const chain = editor.chain().focus().extendMarkRange("link");
    if (editor.state.selection.empty && !hasLink) {
      chain
        .insertContent({
          type: "text",
          text: address,
          marks: [{ type: "link", attrs: { href: address } }],
        })
        .run();
    } else {
      chain.setLink({ href: address }).run();
    }
    onOpenChange(false);
  }

  function remove() {
    editor.chain().focus().extendMarkRange("link").unsetLink().run();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={hasLink ? "Edit link" : "Add a link"}
        // Back to the body, where the link is, rather than the trigger.
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          editor.commands.focus();
        }}
      >
        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          <FormField
            id={id}
            label="Link address"
            hint="Starts with https://, http:// or mailto:"
            errors={error ? [error] : undefined}
          >
            {(control) => (
              <Input
                {...control}
                type="url"
                // The dialog exists to take this one field.
                autoFocus
                value={href}
                onChange={(event) => setHref(event.target.value)}
                autoComplete="off"
              />
            )}
          </FormField>
          <div className="flex flex-wrap justify-end gap-3">
            {hasLink && (
              <Button variant="secondary" onClick={remove}>
                Remove link
              </Button>
            )}
            <Button type="submit">{hasLink ? "Save link" : "Add link"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
