"use client";

import { useEditorState, type Editor } from "@tiptap/react";
import {
  useId,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";

import { Button } from "@/components/ui/button";
import { useKeyboardOpen } from "@/components/hooks/use-keyboard-open";
import type { IconName } from "@/components/icons/icon";
import { IconButton } from "@/components/ui/icon-button";
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
  icon: IconName;
  shortcut: string;
  isActive: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
};

const heading = (level: NoteHeadingLevel): ToolbarItem => ({
  label: `Heading ${level}`,
  icon: `format_h${level}`,
  shortcut: `Control+Alt+${level}`,
  isActive: (editor) => editor.isActive("heading", { level }),
  run: (editor) => editor.chain().focus().toggleHeading({ level }).run(),
});

const MARK_ITEMS: ToolbarItem[] = [
  {
    label: "Bold",
    icon: "format_bold",
    shortcut: "Control+B",
    isActive: (editor) => editor.isActive("bold"),
    run: (editor) => editor.chain().focus().toggleBold().run(),
  },
  {
    label: "Italic",
    icon: "format_italic",
    shortcut: "Control+I",
    isActive: (editor) => editor.isActive("italic"),
    run: (editor) => editor.chain().focus().toggleItalic().run(),
  },
  {
    label: "Strikethrough",
    icon: "format_strikethrough",
    shortcut: "Control+Shift+S",
    isActive: (editor) => editor.isActive("strike"),
    run: (editor) => editor.chain().focus().toggleStrike().run(),
  },
  {
    label: "Code",
    icon: "code",
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
    icon: "format_list_bulleted",
    shortcut: "Control+Shift+8",
    isActive: (editor) => editor.isActive("bulletList"),
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    label: "Numbered list",
    icon: "format_list_numbered",
    shortcut: "Control+Shift+7",
    isActive: (editor) => editor.isActive("orderedList"),
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    label: "Quote",
    icon: "format_quote",
    shortcut: "Control+Shift+B",
    isActive: (editor) => editor.isActive("blockquote"),
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    label: "Code block",
    icon: "data_object",
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

function subscribeToViewport(update: () => void) {
  const viewport = window.visualViewport;
  viewport?.addEventListener("resize", update);
  viewport?.addEventListener("scroll", update);
  window.addEventListener("resize", update);
  return () => {
    viewport?.removeEventListener("resize", update);
    viewport?.removeEventListener("scroll", update);
    window.removeEventListener("resize", update);
  };
}

function keyboardInset() {
  const viewport = window.visualViewport;
  return viewport && viewport.scale === 1
    ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
    : 0;
}

const noKeyboardInset = () => 0;
const divider = (
  <span
    aria-hidden="true"
    className="mx-1 h-5 w-px shrink-0 bg-outline-variant"
  />
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
  const keyboardOpen = useKeyboardOpen();
  const bottom = useSyncExternalStore(
    subscribeToViewport,
    keyboardInset,
    noKeyboardInset,
  );
  const active = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current
        ? {
            items: ALL_ITEMS.map((item) => item.isActive(current)),
            link: current.isActive("link"),
            undo: current.can().undo(),
            redo: current.can().redo(),
          }
        : null,
  });

  const renderItem = (item: ToolbarItem, index: number) => (
    <IconButton
      key={item.label}
      icon={item.icon}
      label={item.label}
      size={40}
      tooltip={false}
      variant={active?.items[index] ? "tonal" : "standard"}
      aria-pressed={active?.items[index] ?? false}
      aria-keyshortcuts={item.shortcut}
      title={`${item.label} (${item.shortcut.replace("Control", "Ctrl")})`}
      disabled={!editor}
      onMouseDown={keepEditorFocus}
      onClick={() => editor && item.run(editor)}
    />
  );

  return (
    <>
      <div
        className="note-toolbar"
        data-docked={keyboardOpen || undefined}
        style={{ "--note-keyboard-bottom": `${bottom}px` } as CSSProperties}
      >
        <div
          role="group"
          aria-label="Formatting"
          tabIndex={0}
          className="flex w-fit max-w-full items-center overflow-x-auto overscroll-x-contain rounded-full bg-surface-container p-1.5 shadow-2 focus-visible:outline-3 focus-visible:outline-offset-2"
        >
          {MARK_ITEMS.map((item, index) => renderItem(item, index))}
          <IconButton
            icon="link"
            label="Link"
            size={40}
            tooltip={false}
            variant={active?.link ? "tonal" : "standard"}
            aria-pressed={active?.link ?? false}
            aria-keyshortcuts="Control+K"
            title="Link (Ctrl+K)"
            disabled={!editor}
            onMouseDown={keepEditorFocus}
            onClick={() => setLinkOpen(true)}
          />
          {divider}
          {BLOCK_ITEMS.map((item, index) =>
            renderItem(item, MARK_ITEMS.length + index),
          )}
          <IconButton
            icon="horizontal_rule"
            label="Divider"
            size={40}
            tooltip={false}
            title="Divider"
            disabled={!editor}
            onMouseDown={keepEditorFocus}
            onClick={() => editor?.chain().focus().setHorizontalRule().run()}
          />
          {divider}
          <IconButton
            icon="undo"
            label="Undo"
            size={40}
            tooltip={false}
            title="Undo (Ctrl+Z)"
            aria-keyshortcuts="Control+Z"
            disabled={!active?.undo}
            onMouseDown={keepEditorFocus}
            onClick={() => editor?.chain().focus().undo().run()}
          />
          <IconButton
            icon="redo"
            label="Redo"
            size={40}
            tooltip={false}
            title="Redo (Ctrl+Shift+Z)"
            aria-keyshortcuts="Control+Shift+Z"
            disabled={!active?.redo}
            onMouseDown={keepEditorFocus}
            onClick={() => editor?.chain().focus().redo().run()}
          />
        </div>
      </div>
      {editor && (
        <LinkDialog
          editor={editor}
          open={linkOpen}
          onOpenChange={setLinkOpen}
        />
      )}
    </>
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
              <Button variant="outlined" onClick={remove}>
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
