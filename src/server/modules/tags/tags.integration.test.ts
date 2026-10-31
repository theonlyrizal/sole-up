import { and, asc, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NoteDocument } from "@/lib/notes/document";
import { NOTE_ARCHIVED, type Note } from "@/lib/notes/note";
import {
  NOTE_TAGS_FULL,
  NOTE_TAGS_MAX,
  TAG_NAME_EMPTY,
  TAG_NAME_TAKEN,
  TAG_NAME_TOO_LONG,
} from "@/lib/notes/tags";
import { db } from "@/server/db/client";
import { auditEvents, notes, noteTags, tags, users } from "@/server/db/schema";
import { ConflictError, NotFoundError } from "@/server/errors";
import { createGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";
import { listNotes } from "@/server/modules/notes/queries";
import {
  archiveNote,
  deleteNote,
  restoreNote,
  saveNote,
} from "@/server/modules/notes/service";
import { saveNoteSchema } from "@/server/modules/notes/validation";
import * as searchActions from "@/server/modules/search/actions";
import { search } from "@/server/modules/search/queries";

import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import * as actions from "./actions";
import { getTag, listNoteTags, listTags } from "./queries";
import { deleteTag, renameTag, setNoteTags } from "./service";
import { renameTagSchema, setNoteTagsSchema } from "./validation";

// Tags on notes (chunk 8.5, ADR 0016): the tables' constraints, the
// service rules, the read models, the tag filters on the Notes list and
// search, the actions, cross-user access and audit privacy.

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

type DriverError = { cause?: { code?: string; constraint?: string } };

async function expectViolation(
  write: () => Promise<unknown>,
  code: string,
  constraint: string,
) {
  let caught: DriverError | null = null;
  try {
    await write();
  } catch (error: unknown) {
    caught = error as DriverError;
  }
  expect(caught).toMatchObject({ cause: { code, constraint } });
}

const CHECK = "23514";
const UNIQUE = "23505";
const FOREIGN_KEY = "23503";

const bodyOf = (text: string): NoteDocument => ({
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text }] }],
});

async function createNote(
  userId: string,
  title = "Trip ideas",
  text = "Lisbon in spring",
): Promise<Note> {
  const note = await saveNote(
    userId,
    saveNoteSchema.parse({
      title,
      body: bodyOf(text),
      expectedUpdatedAt: null,
    }),
  );
  if (!note) throw new Error("expected a note");
  return note;
}

const tag = (userId: string, id: string, names: string[]) =>
  setNoteTags(userId, setNoteTagsSchema.parse({ id, names }));

const rename = (userId: string, id: string, name: string) =>
  renameTag(userId, renameTagSchema.parse({ id, name }));

const names = (list: { name: string }[]) => list.map((item) => item.name);

async function eventsFor(userId: string, entityId: string) {
  const rows = await db
    .select({ type: auditEvents.eventType, changes: auditEvents.changes })
    .from(auditEvents)
    .where(
      and(eq(auditEvents.userId, userId), eq(auditEvents.entityId, entityId)),
    )
    .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id));
  return rows;
}

async function insertTag(userId: string, name: string) {
  const [row] = await db.insert(tags).values({ userId, name }).returning();
  if (!row) throw new Error("expected a tag");
  return row;
}

describe("tables", () => {
  it("checks the name's length and trimming", async () => {
    const user = await createTestUser();
    await expectViolation(
      () => insertTag(user.id, ""),
      CHECK,
      "tags_name_length_check",
    );
    await expectViolation(
      () => insertTag(user.id, "x".repeat(41)),
      CHECK,
      "tags_name_length_check",
    );
    await expectViolation(
      () => insertTag(user.id, " work"),
      CHECK,
      "tags_name_trimmed_check",
    );
    await insertTag(user.id, "x".repeat(40));
  });

  it("keeps names unique per user ignoring case, not across users", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    await insertTag(user.id, "Work");
    await expectViolation(
      () => insertTag(user.id, "wORK"),
      UNIQUE,
      "tags_user_id_name_key",
    );
    await insertTag(other.id, "work");
  });

  it("tags a note once per tag, never across users", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const note = await createNote(owner.id);
    const ownTag = await insertTag(owner.id, "Work");
    const foreignTag = await insertTag(other.id, "Work");
    const foreignNote = await createNote(other.id);

    await db
      .insert(noteTags)
      .values({ userId: owner.id, noteId: note.id, tagId: ownTag.id });
    await expectViolation(
      () =>
        db
          .insert(noteTags)
          .values({ userId: owner.id, noteId: note.id, tagId: ownTag.id }),
      UNIQUE,
      "note_tags_note_id_tag_id_key",
    );
    await expectViolation(
      () =>
        db
          .insert(noteTags)
          .values({ userId: owner.id, noteId: note.id, tagId: foreignTag.id }),
      FOREIGN_KEY,
      "note_tags_tag_id_user_id_fk",
    );
    await expectViolation(
      () =>
        db.insert(noteTags).values({
          userId: owner.id,
          noteId: foreignNote.id,
          tagId: ownTag.id,
        }),
      FOREIGN_KEY,
      "note_tags_note_id_user_id_fk",
    );
  });

  it("has the indexes", async () => {
    const { rows } = await db.execute<{ indexname: string }>(
      sql`select indexname from pg_indexes where tablename in ('tags', 'note_tags') order by indexname`,
    );
    expect(rows.map((row) => row.indexname)).toEqual(
      expect.arrayContaining([
        "tags_user_id_name_key",
        "tags_id_user_id_key",
        "note_tags_note_id_tag_id_key",
        "note_tags_tag_id_user_id_idx",
      ]),
    );
  });

  it("cascades from the note, the tag and the account", async () => {
    const user = await createTestUser();
    const first = await createNote(user.id);
    const second = await createNote(user.id);
    await tag(user.id, first.id, ["Work"]);
    const [kept] = await tag(user.id, second.id, ["Home"]);

    await deleteNote(user.id, { id: first.id });
    expect(await db.select().from(noteTags)).toHaveLength(1);
    expect(names(await listTags(user.id))).toEqual(["Home", "Work"]);

    await db.delete(tags).where(eq(tags.id, kept!.id));
    expect(await db.select().from(noteTags)).toHaveLength(0);

    await db.delete(users).where(eq(users.id, user.id));
    expect(await db.select().from(tags)).toHaveLength(0);
  });
});

describe("setNoteTags", () => {
  it("creates new tags inline and reuses existing ones ignoring case", async () => {
    const user = await createTestUser();
    const first = await createNote(user.id);
    const second = await createNote(user.id);

    const created = await tag(user.id, first.id, ["Work", "Reading list"]);
    expect(names(created)).toEqual(["Reading list", "Work"]);

    // "work" is the existing "Work": no new tag, its spelling kept.
    const reused = await tag(user.id, second.id, ["work", "Ideas"]);
    expect(names(reused)).toEqual(["Ideas", "Work"]);
    expect(reused.find((t) => t.name === "Work")?.id).toBe(
      created.find((t) => t.name === "Work")?.id,
    );
    expect(names(await listTags(user.id))).toEqual([
      "Ideas",
      "Reading list",
      "Work",
    ]);

    const tagEvents = await db
      .select({ type: auditEvents.eventType })
      .from(auditEvents)
      .where(eq(auditEvents.entityType, "tag"));
    expect(tagEvents.map((event) => event.type)).toEqual([
      "tag.created",
      "tag.created",
      "tag.created",
    ]);
  });

  it("drops repeats ignoring case and normalizes spaces", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    const result = await tag(user.id, note.id, [
      "  Deep   work ",
      "deep work",
      "DEEP\tWORK",
    ]);
    expect(names(result)).toEqual(["Deep work"]);
  });

  it("records the tag IDs from and to, and nothing for a no-op", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);

    const first = await tag(user.id, note.id, ["Work", "Home"]);
    const ids = first.map((t) => t.id).sort();
    await tag(user.id, note.id, ["home", "WORK"]);
    const second = await tag(user.id, note.id, ["Home"]);
    await tag(user.id, note.id, []);

    const events = (await eventsFor(user.id, note.id)).filter(
      (event) => event.type === "note.tags_changed",
    );
    expect(events.map((event) => event.changes)).toEqual([
      { tagIds: { from: [], to: ids } },
      { tagIds: { from: ids, to: [second[0]!.id] } },
      { tagIds: { from: [second[0]!.id], to: [] } },
    ]);
    // Removing a tag from a note keeps the tag.
    expect(names(await listTags(user.id))).toEqual(["Home", "Work"]);
  });

  it("doesn't move the note's updated_at", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    await tag(user.id, note.id, ["Work"]);
    const [row] = await db
      .select({ updatedAt: notes.updatedAt })
      .from(notes)
      .where(eq(notes.id, note.id));
    expect(row?.updatedAt).toEqual(note.updatedAt);
  });

  it("allows 20 tags and refuses a 21st", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    const twenty = Array.from({ length: NOTE_TAGS_MAX }, (_, i) => `t${i}`);
    expect(await tag(user.id, note.id, twenty)).toHaveLength(20);

    const parsed = setNoteTagsSchema.safeParse({
      id: note.id,
      names: [...twenty, "one more"],
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toBe(NOTE_TAGS_FULL);

    // Repeats ignoring case don't count against the limit.
    expect(await tag(user.id, note.id, [...twenty, "T0", "T1"])).toHaveLength(
      20,
    );
  });

  it("refuses empty and over-long names", () => {
    const id = crypto.randomUUID();
    for (const [name, message] of [
      ["", TAG_NAME_EMPTY],
      ["   ", TAG_NAME_EMPTY],
      ["x".repeat(41), TAG_NAME_TOO_LONG],
    ] as const) {
      const parsed = setNoteTagsSchema.safeParse({ id, names: [name] });
      expect(parsed.error?.issues[0]?.message).toBe(message);
    }
    expect(
      setNoteTagsSchema.safeParse({ id, names: ["x"], extra: 1 }).success,
    ).toBe(false);
  });

  it("refuses changes while the note is archived", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    await tag(user.id, note.id, ["Work"]);
    await archiveNote(user.id, { id: note.id });

    await expect(tag(user.id, note.id, ["Home"])).rejects.toEqual(
      new ConflictError(NOTE_ARCHIVED),
    );
    expect(names(await listNoteTags(user.id, note.id))).toEqual(["Work"]);
    expect(names(await listTags(user.id))).toEqual(["Work"]);

    await restoreNote(user.id, { id: note.id });
    expect(names(await tag(user.id, note.id, ["Home"]))).toEqual(["Home"]);
  });
});

describe("renameTag", () => {
  it("renames, including a change of case, and records tag.renamed", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    const [work] = await tag(user.id, note.id, ["Work"]);

    expect(await rename(user.id, work!.id, "Job")).toEqual({
      id: work!.id,
      name: "Job",
    });
    expect(await rename(user.id, work!.id, "JOB")).toEqual({
      id: work!.id,
      name: "JOB",
    });
    // The same name is a no-op.
    await rename(user.id, work!.id, "JOB");

    expect(
      (await eventsFor(user.id, work!.id)).map((event) => event.type),
    ).toEqual(["tag.created", "tag.renamed", "tag.renamed"]);
    expect(names(await listNoteTags(user.id, note.id))).toEqual(["JOB"]);
  });

  it("refuses a name another tag has, ignoring case", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    const [home, work] = await tag(user.id, note.id, ["Home", "Work"]);

    await expect(rename(user.id, work!.id, "home")).rejects.toEqual(
      new ConflictError(TAG_NAME_TAKEN),
    );
    expect(await getTag(user.id, work!.id)).toEqual({
      id: work!.id,
      name: "Work",
    });
    expect(await getTag(user.id, home!.id)).toEqual({
      id: home!.id,
      name: "Home",
    });
  });
});

describe("deleteTag", () => {
  it("only untags its notes, and removes the tag's own events", async () => {
    const user = await createTestUser();
    const first = await createNote(user.id, "First");
    const second = await createNote(user.id, "Second");
    const [, work] = await tag(user.id, first.id, ["Home", "Work"]);
    await tag(user.id, second.id, ["Work"]);
    await rename(user.id, work!.id, "Job");
    const noteEvents = await eventsFor(user.id, first.id);

    await deleteTag(user.id, { id: work!.id });

    expect(await db.select({ id: notes.id }).from(notes)).toHaveLength(2);
    expect(names(await listNoteTags(user.id, first.id))).toEqual(["Home"]);
    expect(await listNoteTags(user.id, second.id)).toEqual([]);
    expect(names(await listTags(user.id))).toEqual(["Home"]);
    expect(await eventsFor(user.id, work!.id)).toEqual([]);
    // The notes' own history is untouched: no event for the untagging.
    expect(await eventsFor(user.id, first.id)).toEqual(noteEvents);

    await expect(deleteTag(user.id, { id: work!.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("read models and filters", () => {
  it("counts each tag's notes, archived ones included", async () => {
    const user = await createTestUser();
    const first = await createNote(user.id);
    const second = await createNote(user.id);
    await tag(user.id, first.id, ["Work", "Home"]);
    await tag(user.id, second.id, ["work"]);
    await archiveNote(user.id, { id: second.id });
    // An unused tag stays, with no notes.
    const spare = await createNote(user.id);
    await tag(user.id, spare.id, ["Spare"]);
    await tag(user.id, spare.id, []);

    expect(
      (await listTags(user.id)).map(({ name, noteCount }) => [name, noteCount]),
    ).toEqual([
      ["Home", 1],
      ["Spare", 0],
      ["Work", 2],
    ]);
  });

  it("filters the Notes list by one tag and lists each note's tags", async () => {
    const user = await createTestUser();
    const first = await createNote(user.id, "First");
    const second = await createNote(user.id, "Second");
    const third = await createNote(user.id, "Third");
    const [work] = await tag(user.id, first.id, ["Work"]);
    await tag(user.id, second.id, ["Work", "Home"]);
    await tag(user.id, third.id, ["Home"]);
    await archiveNote(user.id, { id: first.id });

    const all = await listNotes(user.id, { archived: false });
    expect(all.map((note) => [note.title, names(note.tags)])).toEqual([
      ["Third", ["Home"]],
      ["Second", ["Home", "Work"]],
    ]);
    const filtered = await listNotes(user.id, {
      archived: false,
      tagId: work!.id,
    });
    expect(filtered.map((note) => note.title)).toEqual(["Second"]);
    const archived = await listNotes(user.id, {
      archived: true,
      tagId: work!.id,
    });
    expect(archived.map((note) => note.title)).toEqual(["First"]);
  });

  it("filters search's notes group only", async () => {
    const user = await createTestUser();
    const tagged = await createNote(user.id, "Running plan", "tempo runs");
    await createNote(user.id, "Running shoes", "new pair");
    const [work] = await tag(user.id, tagged.id, ["Training"]);
    await createGoal(user.id, createGoalSchema.parse({ title: "Run a 10k" }));

    const result = await search(user.id, "run", { tagId: work!.id });
    expect(result).toMatchObject({ status: "results" });
    if (result.status !== "results") return;
    expect(result.notes.map((hit) => hit.id)).toEqual([tagged.id]);
    expect(result.goals).toHaveLength(1);

    const unfiltered = await search(user.id, "run");
    if (unfiltered.status !== "results") throw new Error("expected results");
    expect(unfiltered.notes).toHaveLength(2);
  });
});

describe("cross-user", () => {
  it("refuses another user's note and tag IDs, with the same NotFound", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const note = await createNote(owner.id);
    const [work] = await tag(owner.id, note.id, ["Work"]);

    await expect(tag(other.id, note.id, ["Work"])).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(rename(other.id, work!.id, "Mine")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(deleteTag(other.id, { id: work!.id })).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(await getTag(other.id, work!.id)).toBeNull();
    expect(await listNoteTags(other.id, note.id)).toEqual([]);
    expect(await listTags(other.id)).toEqual([]);
    expect(names(await listNoteTags(owner.id, note.id))).toEqual(["Work"]);
  });

  it("gives each user their own tag of the same name", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const [ownerTag] = await tag(owner.id, (await createNote(owner.id)).id, [
      "Work",
    ]);
    const otherNote = await createNote(other.id);
    const [otherTag] = await tag(other.id, otherNote.id, ["work"]);
    expect(otherTag!.id).not.toBe(ownerTag!.id);
    expect(otherTag!.name).toBe("work");
  });

  it("filters nothing of the owner's with their tag ID", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const note = await createNote(owner.id, "Running plan");
    const [work] = await tag(owner.id, note.id, ["Work"]);
    await createNote(other.id, "Running log");

    expect(
      await listNotes(other.id, { archived: false, tagId: work!.id }),
    ).toEqual([]);
    const result = await search(other.id, "running", { tagId: work!.id });
    expect(result).toMatchObject({ status: "results", notes: [] });
  });
});

describe("actions", () => {
  it("need a signed-in user", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    const [work] = await tag(user.id, note.id, ["Work"]);
    const unauthenticated = { ok: false, error: { code: "UNAUTHENTICATED" } };

    expect(await actions.setNoteTags({ id: note.id, names: [] })).toMatchObject(
      unauthenticated,
    );
    expect(await actions.getNoteTags({ id: note.id })).toMatchObject(
      unauthenticated,
    );
    expect(await actions.listTags({})).toMatchObject(unauthenticated);
    expect(
      await actions.renameTag({ id: work!.id, name: "Job" }),
    ).toMatchObject(unauthenticated);
    expect(await actions.deleteTag({ id: work!.id })).toMatchObject(
      unauthenticated,
    );
    expect(names(await listNoteTags(user.id, note.id))).toEqual(["Work"]);
  });

  it("act on the user's own notes and tags only", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const note = await createNote(owner.id);
    const [work] = await tag(owner.id, note.id, ["Work"]);

    await signInAs(other.id);
    const notFound = { ok: false, error: { code: "NOT_FOUND" } };
    expect(
      await actions.setNoteTags({ id: note.id, names: ["Mine"] }),
    ).toMatchObject(notFound);
    expect(
      await actions.renameTag({ id: work!.id, name: "Mine" }),
    ).toMatchObject(notFound);
    expect(await actions.deleteTag({ id: work!.id })).toMatchObject(notFound);
    expect(await actions.getNoteTags({ id: note.id })).toEqual({
      ok: true,
      data: [],
    });
    expect(
      await searchActions.search({ query: "lisbon", tagId: work!.id }),
    ).toMatchObject({ ok: true, data: { notes: [] } });

    await signInAs(owner.id);
    expect(
      await actions.setNoteTags({ id: note.id, names: ["Work", "Home"] }),
    ).toMatchObject({ ok: true, data: [{ name: "Home" }, { name: "Work" }] });
    expect(
      await actions.renameTag({ id: work!.id, name: "home" }),
    ).toMatchObject({
      ok: false,
      error: { code: "CONFLICT", message: TAG_NAME_TAKEN },
    });
    expect(
      await actions.setNoteTags({
        id: note.id,
        names: Array.from({ length: 21 }, (_, i) => `t${i}`),
      }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(
      await searchActions.search({ query: "lisbon", tagId: "not-an-id" }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
    expect(await actions.deleteTag({ id: work!.id })).toEqual({
      ok: true,
      data: undefined,
    });
  });
});

describe("audit privacy", () => {
  it("no tag name ever goes into an audit event", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    const [periwinkle] = await tag(user.id, note.id, [
      "Periwinkle",
      "Chartreuse",
    ]);
    await tag(user.id, note.id, ["chartreuse", "Gamboge"]);
    await rename(user.id, periwinkle!.id, "Viridian");
    await tag(user.id, note.id, ["Viridian"]);
    await expect(rename(user.id, periwinkle!.id, "gamboge")).rejects.toEqual(
      new ConflictError(TAG_NAME_TAKEN),
    );

    const events = await db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.userId, user.id));
    expect(new Set(events.map((event) => event.eventType))).toEqual(
      new Set([
        "note.created",
        "tag.created",
        "note.tags_changed",
        "tag.renamed",
      ]),
    );
    const stored = JSON.stringify(events).toLowerCase();
    for (const word of ["periwinkle", "chartreuse", "gamboge", "viridian"]) {
      expect(stored).not.toContain(word);
    }
  });
});
