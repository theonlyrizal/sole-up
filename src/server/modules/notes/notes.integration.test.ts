import { and, asc, eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { EMPTY_NOTE_DOCUMENT, type NoteDocument } from "@/lib/notes/document";
import {
  NOTE_ARCHIVED,
  NOTE_CHANGED_ELSEWHERE,
  NOTE_LINKS_FULL,
  NOTE_LINKS_MAX,
  type Note,
} from "@/lib/notes/note";
import { db } from "@/server/db/client";
import {
  auditEvents,
  noteGoals,
  notes,
  noteTasks,
  users,
} from "@/server/db/schema";
import { ConflictError, NotFoundError } from "@/server/errors";
import {
  changeGoalStatus,
  createGoal,
  deleteGoal,
} from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";
import {
  changeTaskStatus,
  createTask,
  deleteTask,
} from "@/server/modules/tasks/service";
import { createTaskSchema } from "@/server/modules/tasks/validation";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import {
  archiveNote,
  deleteNote,
  linkNote,
  restoreNote,
  saveNote,
  unlinkNote,
} from "./service";
import { noteLinkSchema, saveNoteSchema } from "./validation";

type DriverError = { cause?: { code?: string; constraint?: string } };

async function writeError(write: () => Promise<unknown>) {
  try {
    await write();
    return null;
  } catch (error: unknown) {
    return error as DriverError;
  }
}

async function expectViolation(
  write: () => Promise<unknown>,
  code: string,
  constraint: string,
) {
  expect(await writeError(write)).toMatchObject({
    cause: { code, constraint },
  });
}

const CHECK = "23514";
const UNIQUE = "23505";
const FOREIGN_KEY = "23503";

const MINUTE = 60 * 1000;

const bodyOf = (...paragraphs: string[]): NoteDocument => ({
  type: "doc",
  content: paragraphs.map((text) => ({
    type: "paragraph",
    content: [{ type: "text", text }],
  })),
});

/** A note's first save, through the validation schema. */
async function createNote(
  userId: string,
  fields: { title?: string; body?: unknown } = {},
): Promise<Note> {
  const note = await saveNote(
    userId,
    saveNoteSchema.parse({
      title: fields.title ?? "Trip ideas",
      body: fields.body ?? bodyOf("Lisbon in spring"),
      expectedUpdatedAt: null,
    }),
  );
  if (!note) throw new Error("expected a note");
  return note;
}

/** A later save of `note`, from the `updated_at` it was read with. */
function save(
  userId: string,
  note: Pick<Note, "id" | "updatedAt">,
  fields: { title?: string | null; body?: unknown },
  now?: Date,
) {
  return saveNote(
    userId,
    saveNoteSchema.parse({
      id: note.id,
      title: fields.title === undefined ? "Trip ideas" : fields.title,
      body: fields.body ?? bodyOf("Lisbon in spring"),
      expectedUpdatedAt: note.updatedAt,
    }),
    now,
  );
}

const link = (
  userId: string,
  id: string,
  targetType: "goal" | "task",
  targetId: string,
) => linkNote(userId, noteLinkSchema.parse({ id, targetType, targetId }));

const unlink = (
  userId: string,
  id: string,
  targetType: "goal" | "task",
  targetId: string,
) => unlinkNote(userId, noteLinkSchema.parse({ id, targetType, targetId }));

const newGoal = (userId: string, title = "Run a 10k") =>
  createGoal(userId, createGoalSchema.parse({ title }));

const newTask = (userId: string, title = "Book physio") =>
  createTask(userId, createTaskSchema.parse({ title }));

async function readNote(id: string) {
  const [row] = await db.select().from(notes).where(eq(notes.id, id));
  return row;
}

async function eventsFor(userId: string, entityId: string) {
  return db
    .select({
      id: auditEvents.id,
      type: auditEvents.eventType,
      changes: auditEvents.changes,
    })
    .from(auditEvents)
    .where(
      and(eq(auditEvents.userId, userId), eq(auditEvents.entityId, entityId)),
    )
    .orderBy(asc(auditEvents.occurredAt), asc(auditEvents.id));
}

async function linksOf(noteId: string) {
  const goalLinks = await db
    .select({ goalId: noteGoals.goalId })
    .from(noteGoals)
    .where(eq(noteGoals.noteId, noteId));
  const taskLinks = await db
    .select({ taskId: noteTasks.taskId })
    .from(noteTasks)
    .where(eq(noteTasks.noteId, noteId));
  return {
    goals: goalLinks.map((row) => row.goalId),
    tasks: taskLinks.map((row) => row.taskId),
  };
}

/** Moves every `note.updated` event of a note to `at`. */
async function setUpdatedEventsAt(noteId: string, at: Date) {
  await db
    .update(auditEvents)
    .set({ occurredAt: at })
    .where(
      and(
        eq(auditEvents.entityId, noteId),
        eq(auditEvents.eventType, "note.updated"),
      ),
    );
}

/** Inserts a note row directly, bypassing the service. */
function insertNote(
  userId: string,
  values: Partial<typeof notes.$inferInsert> = {},
) {
  return db
    .insert(notes)
    .values({
      userId,
      body: EMPTY_NOTE_DOCUMENT,
      bodyText: "",
      ...values,
    })
    .returning({ id: notes.id });
}

describe("database constraints", () => {
  it("checks the title length when set", async () => {
    const user = await createTestUser();
    await expectViolation(
      () => insertNote(user.id, { title: "" }),
      CHECK,
      "notes_title_length_check",
    );
    await expectViolation(
      () => insertNote(user.id, { title: "a".repeat(201) }),
      CHECK,
      "notes_title_length_check",
    );
    await insertNote(user.id, { title: "a".repeat(200) });
    await insertNote(user.id, { title: null });
  });

  it("checks body_text up to 100,000 characters", async () => {
    const user = await createTestUser();
    await expectViolation(
      () => insertNote(user.id, { bodyText: "a".repeat(100_001) }),
      CHECK,
      "notes_body_text_length_check",
    );
    await insertNote(user.id, { bodyText: "a".repeat(100_000) });
  });

  it("requires body and body_text", async () => {
    const user = await createTestUser();
    expect(
      await writeError(() =>
        db.execute(
          sql`insert into notes (user_id, body_text) values (${user.id}, '')`,
        ),
      ),
    ).toMatchObject({ cause: { code: "23502" } });
  });

  it("won't let a link join one user's note to another's goal or task", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const [note] = await insertNote(owner.id);
    const goal = await newGoal(other.id);
    const task = await newTask(other.id);

    await expectViolation(
      () =>
        db
          .insert(noteGoals)
          .values({ userId: owner.id, noteId: note!.id, goalId: goal.id }),
      FOREIGN_KEY,
      "note_goals_goal_id_user_id_fk",
    );
    await expectViolation(
      () =>
        db
          .insert(noteTasks)
          .values({ userId: owner.id, noteId: note!.id, taskId: task.id }),
      FOREIGN_KEY,
      "note_tasks_task_id_user_id_fk",
    );
    // Claiming the other user's ID instead breaks the note side.
    await expectViolation(
      () =>
        db
          .insert(noteGoals)
          .values({ userId: other.id, noteId: note!.id, goalId: goal.id }),
      FOREIGN_KEY,
      "note_goals_note_id_user_id_fk",
    );
    await expectViolation(
      () =>
        db
          .insert(noteTasks)
          .values({ userId: other.id, noteId: note!.id, taskId: task.id }),
      FOREIGN_KEY,
      "note_tasks_note_id_user_id_fk",
    );
  });

  it("links each pair once", async () => {
    const user = await createTestUser();
    const [note] = await insertNote(user.id);
    const goal = await newGoal(user.id);
    const task = await newTask(user.id);
    const goalLink = { userId: user.id, noteId: note!.id, goalId: goal.id };
    const taskLink = { userId: user.id, noteId: note!.id, taskId: task.id };
    await db.insert(noteGoals).values(goalLink);
    await db.insert(noteTasks).values(taskLink);

    await expectViolation(
      () => db.insert(noteGoals).values(goalLink),
      UNIQUE,
      "note_goals_note_id_goal_id_key",
    );
    await expectViolation(
      () => db.insert(noteTasks).values(taskLink),
      UNIQUE,
      "note_tasks_note_id_task_id_key",
    );
  });

  it("indexes search_vector with GIN and the link targets", async () => {
    const result = await db.execute<{ indexname: string; indexdef: string }>(
      sql`select indexname, indexdef from pg_indexes where tablename in ('notes', 'note_goals', 'note_tasks') order by indexname`,
    );
    const defs = Object.fromEntries(
      result.rows.map((row) => [row.indexname, row.indexdef]),
    );
    expect(defs["notes_search_vector_idx"]).toContain(
      "USING gin (search_vector)",
    );
    expect(defs["notes_user_id_updated_at_idx"]).toContain(
      "(user_id, updated_at)",
    );
    expect(defs["note_goals_goal_id_user_id_idx"]).toContain(
      "(goal_id, user_id)",
    );
    expect(defs["note_tasks_task_id_user_id_idx"]).toContain(
      "(task_id, user_id)",
    );
  });

  it("cascades a deleted account to its notes and links", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    const goal = await newGoal(user.id);
    await link(user.id, note.id, "goal", goal.id);

    await db.delete(users).where(eq(users.id, user.id));

    expect(await readNote(note.id)).toBeUndefined();
    expect(await linksOf(note.id)).toEqual({ goals: [], tasks: [] });
  });
});

describe("search_vector", () => {
  it("is generated from the title and body text, the title ranked higher", async () => {
    const user = await createTestUser();
    const inTitle = await createNote(user.id, {
      title: "Running plan",
      body: bodyOf("Weekly mileage."),
    });
    const inBody = await createNote(user.id, {
      title: "Weekly mileage",
      body: bodyOf("Notes on running form."),
    });

    const ranked = await db.execute<{ id: string; rank: number }>(
      sql`select id, ts_rank(search_vector, websearch_to_tsquery('english', 'run')) as rank
          from notes
          where user_id = ${user.id}
            and search_vector @@ websearch_to_tsquery('english', 'run')
          order by rank desc`,
    );
    // Stemming: "run" finds "Running" and "running".
    expect(ranked.rows.map((row) => row.id)).toEqual([inTitle.id, inBody.id]);
    expect(Number(ranked.rows[0]!.rank)).toBeGreaterThan(
      Number(ranked.rows[1]!.rank),
    );

    const vector = await db.execute<{ search_vector: string }>(
      sql`select search_vector from notes where id = ${inTitle.id}`,
    );
    expect(vector.rows[0]!.search_vector).toContain("'run':1A");
    expect(vector.rows[0]!.search_vector).toBe(
      "'mileag':4B 'plan':2A 'run':1A 'week':3B",
    );
  });

  it("follows a save and an untitled note", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id, { body: bodyOf("apples") });
    await save(user.id, note, { title: null, body: bodyOf("pears") });

    const vector = await db.execute<{ search_vector: string }>(
      sql`select search_vector from notes where id = ${note.id}`,
    );
    expect(vector.rows[0]!.search_vector).toBe("'pear':1B");
  });

  it("can't be written", async () => {
    const user = await createTestUser();
    const [note] = await insertNote(user.id);
    expect(
      await writeError(() =>
        db.execute(
          sql`update notes set search_vector = to_tsvector('english', 'x') where id = ${note!.id}`,
        ),
      ),
    ).toMatchObject({ cause: { code: "428C9" } });
  });
});

describe("saveNote: first save", () => {
  it("creates nothing from an empty first save", async () => {
    const user = await createTestUser();
    for (const body of [
      EMPTY_NOTE_DOCUMENT,
      bodyOf("   "),
      { type: "doc", content: [{ type: "horizontalRule" }] },
    ]) {
      const result = await saveNote(
        user.id,
        saveNoteSchema.parse({ title: "  ", body, expectedUpdatedAt: null }),
      );
      expect(result).toBeNull();
    }
    expect(
      await db.select().from(notes).where(eq(notes.userId, user.id)),
    ).toEqual([]);
    expect(
      await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.userId, user.id)),
    ).toEqual([]);
  });

  it("creates the note on a title or a body, and derives body_text", async () => {
    const user = await createTestUser();
    const titled = await createNote(user.id, {
      title: "Only a title",
      body: EMPTY_NOTE_DOCUMENT,
    });
    const untitled = await saveNote(
      user.id,
      saveNoteSchema.parse({
        body: bodyOf("First line", "Second line"),
        expectedUpdatedAt: null,
      }),
    );

    expect(titled).toMatchObject({
      title: "Only a title",
      body: EMPTY_NOTE_DOCUMENT,
      bodyText: "",
      archivedAt: null,
    });
    expect(untitled).toMatchObject({
      title: null,
      bodyText: "First line\nSecond line",
    });
    expect((await readNote(untitled!.id))?.bodyText).toBe(
      "First line\nSecond line",
    );
    expect(await eventsFor(user.id, titled.id)).toMatchObject([
      { type: "note.created", changes: { fields: ["title"] } },
    ]);
    expect(await eventsFor(user.id, untitled!.id)).toMatchObject([
      { type: "note.created", changes: { fields: ["body"] } },
    ]);
  });

  it("stores the body as the document it was given", async () => {
    const user = await createTestUser();
    const body = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Plan" }],
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "site",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
      ],
    };
    const note = await createNote(user.id, { body });
    expect((await readNote(note.id))?.body).toEqual(body);
  });
});

describe("saveNote: later saves", () => {
  it("writes a change, moves updated_at and names the changed fields", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);

    const later = new Date(note.updatedAt.getTime() + 5000);
    const saved = await save(
      user.id,
      note,
      { title: "Trip ideas", body: bodyOf("Porto in spring") },
      later,
    );
    expect(saved).toMatchObject({
      bodyText: "Porto in spring",
      updatedAt: later,
      createdAt: note.createdAt,
    });

    const both = await save(
      user.id,
      saved!,
      { title: "Trips", body: bodyOf("Porto") },
      new Date(later.getTime() + 5000),
    );
    expect(both?.title).toBe("Trips");
    // Within the window: only the first update records an event.
    expect((await eventsFor(user.id, note.id)).map((e) => e.changes)).toEqual([
      { fields: ["title", "body"] },
      { fields: ["body"] },
    ]);
  });

  it("is a no-op, with no event and the same updated_at, when nothing changed", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id, {
      title: "Trip ideas",
      body: bodyOf("Lisbon in spring"),
    });

    const saved = await save(user.id, note, {
      title: "  Trip ideas ",
      body: bodyOf("Lisbon in spring"),
    });
    expect(saved?.updatedAt).toEqual(note.updatedAt);
    expect((await eventsFor(user.id, note.id)).map((e) => e.type)).toEqual([
      "note.created",
    ]);
  });

  it("counts a formatting-only change as a body change", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id, { body: bodyOf("word") });
    const bold = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "word", marks: [{ type: "bold" }] }],
        },
      ],
    };
    const saved = await save(user.id, note, { body: bold });
    expect(saved?.updatedAt.getTime()).toBeGreaterThan(
      note.updatedAt.getTime(),
    );
    expect(saved?.bodyText).toBe("word");
  });

  it("keeps a note emptied later", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    const saved = await save(user.id, note, {
      title: null,
      body: EMPTY_NOTE_DOCUMENT,
    });
    expect(saved).toMatchObject({ id: note.id, title: null, bodyText: "" });
    expect(await readNote(note.id)).toBeDefined();
  });

  it("refuses a change from a stale updated_at and keeps the newer text", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);

    // Another tab saves first.
    await save(user.id, note, { body: bodyOf("From tab two") });

    const error = await writeError(() =>
      save(user.id, note, { body: bodyOf("From tab one") }),
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as unknown as Error).message).toBe(NOTE_CHANGED_ELSEWHERE);
    expect((await readNote(note.id))?.bodyText).toBe("From tab two");
  });

  it("returns the current note for a stale save that changes nothing", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    const newer = await save(user.id, note, { body: bodyOf("Same text") });

    const saved = await save(user.id, note, { body: bodyOf("Same text") });
    expect(saved?.updatedAt).toEqual(newer?.updatedAt);
  });

  it("always moves updated_at forward, so the old token goes stale", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    // A clock that reads the same instant (or earlier) for the next save.
    const saved = await save(
      user.id,
      note,
      { body: bodyOf("Changed") },
      new Date(note.updatedAt.getTime() - 60_000),
    );
    expect(saved!.updatedAt.getTime()).toBe(note.updatedAt.getTime() + 1);
    expect(
      await writeError(() => save(user.id, note, { body: bodyOf("Again") })),
    ).toBeInstanceOf(ConflictError);
  });

  it("records note.updated at most once per 10 minutes", async () => {
    const user = await createTestUser();
    let note = await createNote(user.id);
    const typing = async (text: string, now = new Date()) => {
      note = (await save(user.id, note, { body: bodyOf(text) }, now))!;
    };
    const updatedEvents = async () =>
      (await eventsFor(user.id, note.id)).filter(
        (event) => event.type === "note.updated",
      ).length;

    // The first update records one. Then pin the clock: move that event to
    // a fixed instant and save at known offsets from it.
    await typing("a");
    expect(await updatedEvents()).toBe(1);
    const base = new Date("2026-11-04T12:00:00Z");
    await setUpdatedEventsAt(note.id, base);

    await typing("ab", new Date(base.getTime() + 1 * MINUTE));
    await typing("abc", new Date(base.getTime() + 9 * MINUTE));
    await typing("abcd", new Date(base.getTime() + 10 * MINUTE - 1));
    expect(await updatedEvents()).toBe(1);

    await typing("abcde", new Date(base.getTime() + 10 * MINUTE));
    expect(await updatedEvents()).toBe(2);
  });
});

describe("archive and restore", () => {
  it("archives once, without moving updated_at, and restores", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    const at = new Date("2026-11-04T12:00:00Z");

    const archived = await archiveNote(user.id, { id: note.id }, at);
    expect(archived).toMatchObject({
      archivedAt: at,
      updatedAt: note.updatedAt,
    });
    await archiveNote(user.id, { id: note.id });
    expect((await readNote(note.id))?.archivedAt).toEqual(at);

    const restored = await restoreNote(user.id, { id: note.id });
    expect(restored).toMatchObject({
      archivedAt: null,
      updatedAt: note.updatedAt,
    });
    await restoreNote(user.id, { id: note.id });

    expect(await eventsFor(user.id, note.id)).toMatchObject([
      { type: "note.created" },
      {
        type: "note.archived",
        changes: { archivedAt: { from: null, to: at.toISOString() } },
      },
      {
        type: "note.restored",
        changes: { archivedAt: { from: at.toISOString(), to: null } },
      },
    ]);
  });

  it("refuses saves and link changes while archived", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    const goal = await newGoal(user.id);
    const task = await newTask(user.id);
    await link(user.id, note.id, "task", task.id);
    await archiveNote(user.id, { id: note.id });

    for (const write of [
      () => save(user.id, note, { body: bodyOf("Edited") }),
      () => save(user.id, note, {}),
      () => link(user.id, note.id, "goal", goal.id),
      () => unlink(user.id, note.id, "task", task.id),
    ]) {
      const error = await writeError(write);
      expect(error).toBeInstanceOf(ConflictError);
      expect((error as unknown as Error).message).toBe(NOTE_ARCHIVED);
    }
    expect((await readNote(note.id))?.bodyText).toBe("Lisbon in spring");
    expect(await linksOf(note.id)).toEqual({ goals: [], tasks: [task.id] });

    await restoreNote(user.id, { id: note.id });
    const saved = await save(user.id, note, { body: bodyOf("Edited") });
    expect(saved?.bodyText).toBe("Edited");
  });
});

describe("links", () => {
  it("links goals and tasks of any status, once each, without moving updated_at", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    const goal = await newGoal(user.id);
    const task = await newTask(user.id);
    await changeGoalStatus(user.id, { id: goal.id, status: "completed" });
    await changeTaskStatus(user.id, { id: task.id, status: "cancelled" });

    await link(user.id, note.id, "goal", goal.id);
    await link(user.id, note.id, "task", task.id);
    await link(user.id, note.id, "goal", goal.id);

    expect(await linksOf(note.id)).toEqual({
      goals: [goal.id],
      tasks: [task.id],
    });
    expect((await readNote(note.id))?.updatedAt).toEqual(note.updatedAt);
    expect(await eventsFor(user.id, note.id)).toMatchObject([
      { type: "note.created" },
      {
        type: "note.linked",
        changes: { targetType: "goal", targetId: goal.id },
      },
      {
        type: "note.linked",
        changes: { targetType: "task", targetId: task.id },
      },
    ]);
  });

  it("unlinks, and unlinking what isn't linked is a no-op", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    const goal = await newGoal(user.id);
    const task = await newTask(user.id);
    await link(user.id, note.id, "goal", goal.id);

    await unlink(user.id, note.id, "goal", goal.id);
    await unlink(user.id, note.id, "goal", goal.id);
    await unlink(user.id, note.id, "task", task.id);

    expect(await linksOf(note.id)).toEqual({ goals: [], tasks: [] });
    expect((await eventsFor(user.id, note.id)).map((e) => e.type)).toEqual([
      "note.created",
      "note.linked",
      "note.unlinked",
    ]);
  });

  it("allows at most 50 links in all", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    const half = NOTE_LINKS_MAX / 2;
    const goalIds: string[] = [];
    for (let i = 0; i < half; i++) {
      goalIds.push((await newGoal(user.id, `Goal ${i}`)).id);
    }
    const taskIds: string[] = [];
    for (let i = 0; i < half + 1; i++) {
      taskIds.push((await newTask(user.id, `Task ${i}`)).id);
    }
    for (const id of goalIds) await link(user.id, note.id, "goal", id);
    for (const id of taskIds.slice(0, half)) {
      await link(user.id, note.id, "task", id);
    }

    const error = await writeError(() =>
      link(user.id, note.id, "task", taskIds[half]!),
    );
    expect(error).toBeInstanceOf(ConflictError);
    expect((error as unknown as Error).message).toBe(NOTE_LINKS_FULL);
    // Relinking an existing target is still a no-op at the limit.
    await link(user.id, note.id, "goal", goalIds[0]!);

    const links = await linksOf(note.id);
    expect(links.goals.length + links.tasks.length).toBe(NOTE_LINKS_MAX);
  });

  it("keeps the note when its goal or task is deleted", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    const goal = await newGoal(user.id);
    const task = await newTask(user.id);
    await link(user.id, note.id, "goal", goal.id);
    await link(user.id, note.id, "task", task.id);

    await deleteGoal(user.id, { id: goal.id });
    expect(await linksOf(note.id)).toEqual({ goals: [], tasks: [task.id] });
    await deleteTask(user.id, { id: task.id });
    expect(await linksOf(note.id)).toEqual({ goals: [], tasks: [] });

    expect(await readNote(note.id)).toMatchObject({
      id: note.id,
      userId: user.id,
      bodyText: "Lisbon in spring",
    });
  });

  it("keeps a task's link when deleting its goal moves it to the inbox", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    const goal = await newGoal(user.id);
    const task = await createTask(
      user.id,
      createTaskSchema.parse({ title: "Child", goalId: goal.id }),
    );
    await link(user.id, note.id, "task", task.id);

    await deleteGoal(user.id, { id: goal.id });
    expect(await linksOf(note.id)).toEqual({ goals: [], tasks: [task.id] });
  });

  it("refuses a missing goal or task as not found", async () => {
    const user = await createTestUser();
    const note = await createNote(user.id);
    const goal = await newGoal(user.id);
    await deleteGoal(user.id, { id: goal.id });

    expect(
      await writeError(() => link(user.id, note.id, "goal", goal.id)),
    ).toBeInstanceOf(NotFoundError);
    // A goal's ID isn't a task.
    const other = await newGoal(user.id);
    expect(
      await writeError(() => link(user.id, note.id, "task", other.id)),
    ).toBeInstanceOf(NotFoundError);
  });
});

describe("deleteNote", () => {
  it("removes the note, its links and its events, archived or not", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id);
    const task = await newTask(user.id);
    const keep = await createNote(user.id, { title: "Keep" });

    for (const archived of [false, true]) {
      const note = await createNote(user.id);
      await save(user.id, note, { body: bodyOf("Edited") });
      await link(user.id, note.id, "goal", goal.id);
      await link(user.id, note.id, "task", task.id);
      if (archived) await archiveNote(user.id, { id: note.id });

      await deleteNote(user.id, { id: note.id });

      expect(await readNote(note.id)).toBeUndefined();
      expect(await linksOf(note.id)).toEqual({ goals: [], tasks: [] });
      expect(await eventsFor(user.id, note.id)).toEqual([]);
      expect(
        await writeError(() => deleteNote(user.id, { id: note.id })),
      ).toBeInstanceOf(NotFoundError);
    }

    // The goal, the task and other notes stay, with their events.
    expect(await readNote(keep.id)).toBeDefined();
    expect(await eventsFor(user.id, keep.id)).toHaveLength(1);
    expect(await eventsFor(user.id, goal.id)).not.toEqual([]);
  });
});

describe("cross-user access", () => {
  it("treats another user's note as not found for every write", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    const note = await createNote(owner.id);
    const goal = await newGoal(intruder.id);
    const task = await newTask(intruder.id);

    for (const write of [
      () => save(intruder.id, note, { body: bodyOf("Overwritten") }),
      () => archiveNote(intruder.id, { id: note.id }),
      () => restoreNote(intruder.id, { id: note.id }),
      () => deleteNote(intruder.id, { id: note.id }),
      () => link(intruder.id, note.id, "goal", goal.id),
      () => link(intruder.id, note.id, "task", task.id),
      () => unlink(intruder.id, note.id, "goal", goal.id),
    ]) {
      expect(await writeError(write)).toBeInstanceOf(NotFoundError);
    }

    expect(await readNote(note.id)).toMatchObject({
      userId: owner.id,
      bodyText: "Lisbon in spring",
      archivedAt: null,
    });
    expect(await linksOf(note.id)).toEqual({ goals: [], tasks: [] });
    expect((await eventsFor(owner.id, note.id)).map((e) => e.type)).toEqual([
      "note.created",
    ]);
    expect(await eventsFor(intruder.id, note.id)).toEqual([]);
  });

  it("won't link the user's note to another user's goal or task", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const note = await createNote(owner.id);
    const goal = await newGoal(other.id);
    const task = await newTask(other.id);

    expect(
      await writeError(() => link(owner.id, note.id, "goal", goal.id)),
    ).toBeInstanceOf(NotFoundError);
    expect(
      await writeError(() => link(owner.id, note.id, "task", task.id)),
    ).toBeInstanceOf(NotFoundError);
    expect(await linksOf(note.id)).toEqual({ goals: [], tasks: [] });
    expect((await eventsFor(owner.id, note.id)).map((e) => e.type)).toEqual([
      "note.created",
    ]);
  });
});

describe("audit privacy", () => {
  it("events never hold a note's title, body or body text, or linked titles", async () => {
    const user = await createTestUser();
    const goal = await newGoal(user.id, "Zebra goal title");
    const task = await newTask(user.id, "Quokka task title");
    const note = await createNote(user.id, {
      title: "Marigold title",
      body: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Tangerine body " },
              {
                type: "text",
                text: "Saffron link",
                marks: [
                  {
                    type: "link",
                    attrs: { href: "https://vermilion.example.com" },
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    const later = new Date(Date.now() + 11 * MINUTE);
    await save(
      user.id,
      note,
      { title: "Cerulean title", body: bodyOf("Ochre body") },
      later,
    );
    await link(user.id, note.id, "goal", goal.id);
    await link(user.id, note.id, "task", task.id);
    await unlink(user.id, note.id, "task", task.id);
    await archiveNote(user.id, { id: note.id });
    await restoreNote(user.id, { id: note.id });

    const events = await eventsFor(user.id, note.id);
    expect(events.map((event) => event.type)).toEqual([
      "note.created",
      "note.updated",
      "note.linked",
      "note.linked",
      "note.unlinked",
      "note.archived",
      "note.restored",
    ]);
    const stored = JSON.stringify(events);
    for (const word of [
      "Marigold",
      "Tangerine",
      "Saffron",
      "vermilion",
      "Cerulean",
      "Ochre",
      "Zebra",
      "Quokka",
    ]) {
      expect(stored.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });
});
