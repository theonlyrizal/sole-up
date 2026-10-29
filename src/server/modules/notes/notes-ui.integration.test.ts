import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { NOTE_LINK_INVALID, type NoteDocument } from "@/lib/notes/document";
import { NOTE_ARCHIVED, NOTE_CHANGED_ELSEWHERE } from "@/lib/notes/note";
import { db } from "@/server/db/client";
import { auditEvents, notes, userPreferences } from "@/server/db/schema";

import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import * as actions from "./actions";
import { NOTE_PREVIEW_MAX, getNote, listNotes } from "./queries";
import { archiveNote, saveNote } from "./service";

// The Notes pages (chunk 8.2): the list and note read models, and the
// actions the editor calls. Service rules are covered in
// notes.integration.test.ts.

const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));
vi.mock("next/headers", () => ({
  headers: async () => requestHeaders.current,
}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));

beforeEach(() => {
  requestHeaders.current = new Headers();
});

async function signInAs(userId: string) {
  requestHeaders.current = (await asUser(userId)).headers;
}

async function newUser() {
  const user = await createTestUser();
  await db
    .insert(userPreferences)
    .values({ userId: user.id, timezone: "Asia/Tokyo", locale: "en-GB" });
  return user;
}

function doc(...lines: string[]): NoteDocument {
  return {
    type: "doc",
    content: lines.map((text) => ({
      type: "paragraph",
      content: [{ type: "text", text }],
    })),
  };
}

async function note(
  userId: string,
  title: string | null,
  body: NoteDocument,
  at: Date,
) {
  const saved = await saveNote(
    userId,
    { title, body, expectedUpdatedAt: null },
    at,
  );
  if (!saved) throw new Error("Expected a note");
  return saved;
}

describe("listNotes", () => {
  it("lists nothing before the first note", async () => {
    const user = await newUser();
    expect(await listNotes(user.id, { archived: false })).toEqual([]);
    expect(await listNotes(user.id, { archived: true })).toEqual([]);
  });

  it("lists active notes most recently updated first, with a first-line preview and the local date", async () => {
    const user = await newUser();
    const older = await note(
      user.id,
      "Older",
      doc("First line", "Second line"),
      new Date("2026-10-01T10:00:00Z"),
    );
    // 23:30 UTC is the next morning in Tokyo.
    const newer = await note(
      user.id,
      null,
      doc("x".repeat(NOTE_PREVIEW_MAX + 50)),
      new Date("2026-10-02T23:30:00Z"),
    );
    const archived = await note(
      user.id,
      "Gone",
      doc("Hidden"),
      new Date("2026-10-03T10:00:00Z"),
    );
    await archiveNote(user.id, { id: archived.id });

    expect(await listNotes(user.id, { archived: false })).toEqual([
      {
        id: newer.id,
        title: null,
        preview: "x".repeat(NOTE_PREVIEW_MAX),
        updatedAt: newer.updatedAt,
        updatedLabel: "3 Oct 2026",
        archivedLabel: null,
      },
      {
        id: older.id,
        title: "Older",
        preview: "First line",
        updatedAt: older.updatedAt,
        updatedLabel: "1 Oct 2026",
        archivedLabel: null,
      },
    ]);
  });

  it("lists archived notes most recently archived first", async () => {
    const user = await newUser();
    const first = await note(
      user.id,
      "First",
      doc("a"),
      new Date("2026-10-05"),
    );
    const second = await note(
      user.id,
      "Second",
      doc("b"),
      new Date("2026-10-01"),
    );
    await archiveNote(
      user.id,
      { id: second.id },
      new Date("2026-10-10T01:00:00Z"),
    );
    await archiveNote(user.id, { id: first.id }, new Date("2026-10-09"));

    const listed = await listNotes(user.id, { archived: true });
    expect(listed.map((item) => [item.title, item.archivedLabel])).toEqual([
      ["Second", "10 Oct 2026"],
      ["First", "9 Oct 2026"],
    ]);
  });

  it("never lists another user's notes", async () => {
    const owner = await newUser();
    const other = await newUser();
    await note(owner.id, "Mine", doc("Private"), new Date());
    expect(await listNotes(other.id, { archived: false })).toEqual([]);
  });
});

describe("getNote", () => {
  it("returns the user's note with its dates shown, and null for anyone else's", async () => {
    const owner = await newUser();
    const other = await newUser();
    const saved = await note(
      owner.id,
      "Mine",
      doc("Body"),
      new Date("2026-10-01T10:00:00Z"),
    );

    expect(await getNote(owner.id, saved.id)).toMatchObject({
      id: saved.id,
      title: "Mine",
      body: doc("Body"),
      archivedAt: null,
      updatedLabel: "1 Oct 2026",
      archivedLabel: null,
    });
    expect(await getNote(other.id, saved.id)).toBeNull();
    expect(
      await getNote(owner.id, "00000000-0000-4000-8000-000000000000"),
    ).toBeNull();
  });
});

describe("note actions", () => {
  it("refuse a signed-out caller before reading the input", async () => {
    for (const result of [
      await actions.saveNote({
        title: "x",
        body: doc("x"),
        expectedUpdatedAt: null,
      }),
      await actions.loadNote({ id: "not-a-uuid" }),
      await actions.archiveNote({ id: "not-a-uuid" }),
      await actions.restoreNote({ id: "not-a-uuid" }),
      await actions.deleteNote({ id: "not-a-uuid" }),
    ]) {
      expect(result).toMatchObject({
        ok: false,
        error: { code: "UNAUTHENTICATED" },
      });
    }
    expect(await db.select().from(notes)).toEqual([]);
  });

  it("autosave: nothing for an empty first save, then create, update, and refuse a stale save", async () => {
    const user = await newUser();
    await signInAs(user.id);

    expect(
      await actions.saveNote({
        title: "  ",
        body: { type: "doc", content: [{ type: "paragraph" }] },
        expectedUpdatedAt: null,
      }),
    ).toEqual({ ok: true, data: null });
    expect(await db.select().from(notes)).toEqual([]);

    const created = await actions.saveNote({
      title: "Plan",
      body: doc("One"),
      expectedUpdatedAt: null,
    });
    if (!created.ok || !created.data) throw new Error("Expected a note");
    // Only what the next save needs: never the body back.
    expect(Object.keys(created.data).sort()).toEqual(["id", "updatedAt"]);
    const { id, updatedAt: first } = created.data;

    const updated = await actions.saveNote({
      id,
      title: "Plan",
      body: doc("One", "Two"),
      expectedUpdatedAt: first,
    });
    if (!updated.ok || !updated.data) throw new Error("Expected a note");
    expect(updated.data.updatedAt.getTime()).toBeGreaterThan(first.getTime());

    // The editor sends the token as it received it, or as an ISO string.
    expect(
      await actions.saveNote({
        id,
        title: "Plan",
        body: doc("Three"),
        expectedUpdatedAt: first.toISOString(),
      }),
    ).toEqual({
      ok: false,
      error: { code: "CONFLICT", message: NOTE_CHANGED_ELSEWHERE },
    });
    expect((await getNote(user.id, id))?.bodyText).toBe("One\nTwo");
  });

  it("refuses a body outside the allowlist with a fixed message", async () => {
    const user = await newUser();
    await signInAs(user.id);

    const result = await actions.saveNote({
      title: null,
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "click",
                marks: [
                  { type: "link", attrs: { href: "javascript:alert(1)" } },
                ],
              },
            ],
          },
        ],
      },
      expectedUpdatedAt: null,
    });
    expect(result).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: { body: [NOTE_LINK_INVALID] },
      },
    });
    expect(await db.select().from(notes)).toEqual([]);
  });

  it("load, archive, restore and delete the user's own note only", async () => {
    const owner = await newUser();
    const other = await newUser();
    const saved = await note(owner.id, "Mine", doc("Body"), new Date());

    await signInAs(other.id);
    for (const result of [
      await actions.loadNote({ id: saved.id }),
      await actions.archiveNote({ id: saved.id }),
      await actions.restoreNote({ id: saved.id }),
      await actions.deleteNote({ id: saved.id }),
    ]) {
      expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    }

    await signInAs(owner.id);
    expect(await actions.loadNote({ id: saved.id })).toEqual({
      ok: true,
      data: {
        id: saved.id,
        title: "Mine",
        body: doc("Body"),
        updatedAt: saved.updatedAt,
        archived: false,
      },
    });

    expect(await actions.archiveNote({ id: saved.id })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await actions.loadNote({ id: saved.id })).toMatchObject({
      ok: true,
      data: { archived: true },
    });
    // Read-only while archived.
    expect(
      await actions.saveNote({
        id: saved.id,
        title: "Changed",
        body: doc("Body"),
        expectedUpdatedAt: saved.updatedAt,
      }),
    ).toEqual({
      ok: false,
      error: { code: "CONFLICT", message: NOTE_ARCHIVED },
    });

    expect(await actions.restoreNote({ id: saved.id })).toMatchObject({
      ok: true,
    });
    expect((await getNote(owner.id, saved.id))?.archivedAt).toBeNull();

    expect(await actions.deleteNote({ id: saved.id })).toMatchObject({
      ok: true,
    });
    expect(await getNote(owner.id, saved.id)).toBeNull();
    expect(
      await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.entityId, saved.id)),
    ).toEqual([]);
    expect(await actions.loadNote({ id: saved.id })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});
