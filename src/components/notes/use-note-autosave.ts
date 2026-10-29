"use client";

import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import type { ActionError } from "@/lib/result";
import { noteDocumentProblem, type NoteDocument } from "@/lib/notes/document";
import { NOTE_CHANGED_ELSEWHERE, NOTE_TITLE_MAX } from "@/lib/notes/note";
import { saveNote } from "@/server/modules/notes/actions";

// Autosave for the note editor (ADR 0016): about a second after the last
// change, and at once on blur, on leaving the page and on `pagehide`. One
// save runs at a time; changes made during a save are saved after it. A
// stale save is a conflict: saving stops, the text stays on screen, and
// the editor offers the saved version.

export const AUTOSAVE_DELAY_MS = 1000;

export const SAVE_UNREACHABLE =
  "Couldn't reach SoleUp. Check your connection, then try again.";
const TITLE_TOO_LONG = `Keep the title to ${NOTE_TITLE_MAX} characters.`;

export type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string }
  | { kind: "conflict" };

type NoteContentSnapshot = { title: string; body: NoteDocument };

function errorMessage(error: ActionError): string {
  if (error.code === "VALIDATION") {
    return (
      Object.values(error.fieldErrors).flat()[0] ??
      error.formErrors[0] ??
      error.message
    );
  }
  return error.message;
}

export function useNoteAutosave({
  noteId,
  updatedAt,
  read,
  onCreated,
}: {
  noteId: string | null;
  updatedAt: Date | null;
  /** The editor's title and body as they are now. */
  read: () => NoteContentSnapshot;
  /** After the first save that created the note. */
  onCreated: (id: string) => void;
}) {
  const [state, setState] = useState<SaveState>(
    noteId ? { kind: "saved" } : { kind: "idle" },
  );
  const idRef = useRef(noteId);
  const tokenRef = useRef(updatedAt);
  const revisionRef = useRef(0);
  const savedRevisionRef = useRef(0);
  const inFlightRef = useRef<Promise<boolean> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Nothing is saved after a conflict until the saved version is loaded,
  // or once stopped for a delete or for leaving without saving.
  const conflictRef = useRef(false);
  const stoppedRef = useRef(false);
  const readRef = useRef(read);
  const onCreatedRef = useRef(onCreated);
  useLayoutEffect(() => {
    readRef.current = read;
    onCreatedRef.current = onCreated;
  });

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  /** True while a change is unsaved, unless saving was stopped. */
  const hasUnsaved = useCallback(
    () =>
      revisionRef.current !== savedRevisionRef.current && !stoppedRef.current,
    [],
  );

  const saveOnce = useCallback(async (): Promise<boolean> => {
    const revision = revisionRef.current;
    const { title, body } = readRef.current();
    const problem =
      noteDocumentProblem(body) ??
      (title.trim().length > NOTE_TITLE_MAX ? TITLE_TOO_LONG : null);
    if (problem) {
      setState({ kind: "error", message: problem });
      return false;
    }

    setState({ kind: "saving" });
    let result: Awaited<ReturnType<typeof saveNote>>;
    try {
      result = await saveNote({
        id: idRef.current ?? undefined,
        title,
        body,
        expectedUpdatedAt: tokenRef.current,
      });
    } catch {
      setState({ kind: "error", message: SAVE_UNREACHABLE });
      return false;
    }
    if (!result.ok) {
      if (
        result.error.code === "CONFLICT" &&
        result.error.message === NOTE_CHANGED_ELSEWHERE
      ) {
        conflictRef.current = true;
        clearTimer();
        setState({ kind: "conflict" });
      } else {
        setState({ kind: "error", message: errorMessage(result.error) });
      }
      return false;
    }

    if (result.data) {
      const created = idRef.current === null;
      idRef.current = result.data.id;
      tokenRef.current = result.data.updatedAt;
      if (created) onCreatedRef.current(result.data.id);
    }
    savedRevisionRef.current = revision;
    if (revisionRef.current === revision) {
      setState(idRef.current ? { kind: "saved" } : { kind: "idle" });
    }
    return true;
  }, [clearTimer]);

  /**
   * Saves now, after any save in flight, until nothing is left unsaved.
   * True when everything is saved; false on an error or a conflict.
   */
  const flush = useCallback(async (): Promise<boolean> => {
    clearTimer();
    for (;;) {
      if (inFlightRef.current) {
        await inFlightRef.current;
        continue;
      }
      if (!hasUnsaved()) return !stoppedRef.current;
      if (conflictRef.current) return false;
      const run = saveOnce();
      inFlightRef.current = run;
      const saved = await run;
      inFlightRef.current = null;
      if (!saved) return false;
    }
  }, [clearTimer, hasUnsaved, saveOnce]);

  /** Call on every change to the title or body. */
  const changed = useCallback(() => {
    revisionRef.current += 1;
    if (conflictRef.current || stoppedRef.current) return;
    setState({ kind: "saving" });
    clearTimer();
    timerRef.current = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS);
  }, [clearTimer, flush]);

  /** The editor now shows the saved version from `updatedAt`. */
  const loadedSaved = useCallback((savedAt: Date) => {
    tokenRef.current = savedAt;
    savedRevisionRef.current = revisionRef.current;
    conflictRef.current = false;
    setState({ kind: "saved" });
  }, []);

  /** Stops saving, before a delete or leaving without saving. */
  const stop = useCallback(() => {
    stoppedRef.current = true;
    clearTimer();
  }, [clearTimer]);

  const resume = useCallback(() => {
    stoppedRef.current = false;
  }, []);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasUnsaved()) return;
      event.preventDefault();
      // Older browsers need returnValue set to show the prompt.
      event.returnValue = "";
    };
    // Best effort: the page may be gone before the save completes, which
    // is why leaving with an unsaved change asks first.
    const hidden = () => void flush();
    const visibility = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    window.addEventListener("beforeunload", beforeUnload);
    window.addEventListener("pagehide", hidden);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      window.removeEventListener("pagehide", hidden);
      document.removeEventListener("visibilitychange", visibility);
      // Leaving the page another way (browser back): save what's left.
      if (hasUnsaved() && !conflictRef.current) void flush();
      else clearTimer();
    };
  }, [clearTimer, flush, hasUnsaved]);

  return {
    state,
    changed,
    flush,
    hasUnsaved,
    loadedSaved,
    stop,
    resume,
    noteId: () => idRef.current,
  };
}

/**
 * Before following a link inside the app with an unsaved change, saves
 * first, then follows it. If the save fails, `leaveTarget` holds the link
 * so the editor can ask whether to leave without saving.
 */
export function useSaveBeforeLeaving({
  hasUnsaved,
  flush,
}: {
  hasUnsaved: () => boolean;
  flush: () => Promise<boolean>;
}) {
  const router = useRouter();
  const [leaveTarget, setLeaveTarget] = useState<string | null>(null);

  useEffect(() => {
    // Capture on the document runs before Next.js's <Link> handler.
    const onClick = (event: MouseEvent) => {
      if (!hasUnsaved() || event.defaultPrevented || event.button !== 0) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }
      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.closest("[contenteditable='true']")) return;
      if ((anchor.target && anchor.target !== "_self") || anchor.download) {
        return;
      }
      const url = new URL(anchor.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.hash) return;

      event.preventDefault();
      event.stopPropagation();
      const href = `${url.pathname}${url.search}${url.hash}`;
      void flush().then((saved) => {
        if (saved) router.push(href);
        else setLeaveTarget(href);
      });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [flush, hasUnsaved, router]);

  return {
    leaveTarget,
    stay: () => setLeaveTarget(null),
  };
}
