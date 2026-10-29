import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EMPTY_NOTE_DOCUMENT, type NoteDocument } from "@/lib/notes/document";
import { db } from "@/server/db/client";
import {
  auditEvents,
  goals,
  noteGoals,
  notes,
  noteTasks,
  tasks,
  userPreferences,
} from "@/server/db/schema";
import { createGoal, deleteGoal } from "@/server/modules/goals/service";
import {
  getArchivedGoals,
  getGoalDetail,
} from "@/server/modules/goals/queries";
import { createGoalSchema } from "@/server/modules/goals/validation";
import * as taskActions from "@/server/modules/tasks/actions";
import { changeTaskStatus, createTask } from "@/server/modules/tasks/service";
import { createTaskSchema } from "@/server/modules/tasks/validation";

import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import * as actions from "./actions";
import {
  LINK_PICKER_LIMIT,
  countLinkedNotes,
  findLinkTargets,
  findNotesToLink,
  getLinkTarget,
  listLinkedNotes,
  listNoteLinks,
} from "./queries";
import { archiveNote, linkNote, saveNote } from "./service";
import { noteLinkSchema, saveNoteSchema } from "./validation";

// Linking (chunk 8.3): a new note linked on its first save, the link read
// models and pickers, the link actions, the goal page's notes, and task
// delete keeping linked notes. Link service rules are covered in
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

async function newNote(
  userId: string,
  title: string | null,
  text = "Body",
  at?: Date,
) {
  const saved = await saveNote(
    userId,
    saveNoteSchema.parse({ title, body: doc(text), expectedUpdatedAt: null }),
    at,
  );
  if (!saved) throw new Error("Expected a note");
  return saved;
}

const newGoal = (userId: string, title = "Run a 10k") =>
  createGoal(userId, createGoalSchema.parse({ title }));

const newTask = (userId: string, title = "Book physio") =>
  createTask(userId, createTaskSchema.parse({ title }));

const link = (
  userId: string,
  id: string,
  targetType: "goal" | "task",
  targetId: string,
) => linkNote(userId, noteLinkSchema.parse({ id, targetType, targetId }));

async function eventsOf(noteId: string) {
  return db
    .select({ type: auditEvents.eventType, changes: auditEvents.changes })
    .from(auditEvents)
    .where(
      and(eq(auditEvents.entityType, "note"), eq(auditEvents.entityId, noteId)),
    );
}

describe("a new note linked on its first save", () => {
  it("creates the note and the link, with both events, in one save", async () => {
    const user = await newUser();
    const goal = await newGoal(user.id);
    const saved = await saveNote(
      user.id,
      saveNoteSchema.parse({
        title: "Training plan",
        body: doc("Week one"),
        expectedUpdatedAt: null,
        linkTo: { targetType: "goal", targetId: goal.id },
      }),
    );
    expect(saved).not.toBeNull();
    expect(await listNoteLinks(user.id, saved!.id)).toEqual([
      {
        targetType: "goal",
        targetId: goal.id,
        title: "Run a 10k",
        statusLabel: "Active",
      },
    ]);
    expect(
      (await eventsOf(saved!.id)).map((event) => event.type).sort(),
    ).toEqual(["note.created", "note.linked"]);
  });

  it("links a task the same way", async () => {
    const user = await newUser();
    const task = await newTask(user.id);
    const saved = await saveNote(
      user.id,
      saveNoteSchema.parse({
        title: null,
        body: doc("Ask about the knee"),
        expectedUpdatedAt: null,
        linkTo: { targetType: "task", targetId: task.id },
      }),
    );
    expect(await listNoteLinks(user.id, saved!.id)).toMatchObject([
      { targetType: "task", targetId: task.id, statusLabel: "Open" },
    ]);
  });

  it("stores nothing for an empty first save", async () => {
    const user = await newUser();
    const goal = await newGoal(user.id);
    const saved = await saveNote(
      user.id,
      saveNoteSchema.parse({
        title: "",
        body: EMPTY_NOTE_DOCUMENT,
        expectedUpdatedAt: null,
        linkTo: { targetType: "goal", targetId: goal.id },
      }),
    );
    expect(saved).toBeNull();
    expect(await db.select().from(notes)).toEqual([]);
    expect(await db.select().from(noteGoals)).toEqual([]);
  });

  it("creates the note without the link when the target is someone else's or gone", async () => {
    const user = await newUser();
    const other = await newUser();
    const foreignGoal = await newGoal(other.id);
    const gone = await newTask(user.id);
    await db.delete(tasks).where(eq(tasks.id, gone.id));

    for (const linkTo of [
      { targetType: "goal" as const, targetId: foreignGoal.id },
      { targetType: "task" as const, targetId: gone.id },
    ]) {
      const saved = await saveNote(
        user.id,
        saveNoteSchema.parse({
          title: "Kept",
          body: doc("Text"),
          expectedUpdatedAt: null,
          linkTo,
        }),
      );
      expect(saved).not.toBeNull();
      expect(await listNoteLinks(user.id, saved!.id)).toEqual([]);
      expect((await eventsOf(saved!.id)).map((event) => event.type)).toEqual([
        "note.created",
      ]);
    }
    expect(await db.select().from(noteGoals)).toEqual([]);
    expect(await db.select().from(noteTasks)).toEqual([]);
  });
});

describe("listNoteLinks", () => {
  it("lists goals then tasks in link order, any status, and nothing for someone else", async () => {
    const user = await newUser();
    const other = await newUser();
    const note = await newNote(user.id, "Plan");
    const goal = await newGoal(user.id, "Learn Spanish");
    const firstTask = await newTask(user.id, "Buy a textbook");
    const secondTask = await newTask(user.id, "Find a tutor");
    await changeTaskStatus(user.id, { id: firstTask.id, status: "completed" });
    await link(user.id, note.id, "task", secondTask.id);
    await link(user.id, note.id, "task", firstTask.id);
    await link(user.id, note.id, "goal", goal.id);

    expect(await listNoteLinks(user.id, note.id)).toEqual([
      {
        targetType: "goal",
        targetId: goal.id,
        title: "Learn Spanish",
        statusLabel: "Active",
      },
      {
        targetType: "task",
        targetId: secondTask.id,
        title: "Find a tutor",
        statusLabel: "Open",
      },
      {
        targetType: "task",
        targetId: firstTask.id,
        title: "Buy a textbook",
        statusLabel: "Completed",
      },
    ]);
    expect(await listNoteLinks(other.id, note.id)).toEqual([]);
  });
});

describe("findLinkTargets", () => {
  it("matches titles ignoring case, any status, the user's only", async () => {
    const user = await newUser();
    const other = await newUser();
    const goal = await newGoal(user.id, "Run a Marathon");
    await newGoal(user.id, "Read more");
    const task = await newTask(user.id, "Marathon shoes");
    await changeTaskStatus(user.id, { id: task.id, status: "cancelled" });
    await newGoal(other.id, "Marathon too");

    expect(await findLinkTargets(user.id, "marathon")).toEqual({
      goals: [
        {
          targetType: "goal",
          targetId: goal.id,
          title: "Run a Marathon",
          statusLabel: "Active",
        },
      ],
      tasks: [
        {
          targetType: "task",
          targetId: task.id,
          title: "Marathon shoes",
          statusLabel: "Cancelled",
        },
      ],
    });
  });

  it("treats %, _ and backslash as plain characters", async () => {
    const user = await newUser();
    await newTask(user.id, "Save 100% of it");
    await newTask(user.id, "Save 1000 of it");
    await newTask(user.id, "snake_case");
    await newTask(user.id, "snakeXcase");
    await newTask(user.id, "C:\\temp");

    const titles = async (query: string) =>
      (await findLinkTargets(user.id, query)).tasks.map((task) => task.title);
    expect(await titles("100%")).toEqual(["Save 100% of it"]);
    expect(await titles("e_c")).toEqual(["snake_case"]);
    expect(await titles("\\t")).toEqual(["C:\\temp"]);
  });

  it("lists the most recently updated first, up to the limit, for an empty query", async () => {
    const user = await newUser();
    const created = [];
    for (let index = 0; index < LINK_PICKER_LIMIT + 2; index += 1) {
      created.push(await newTask(user.id, `Task ${index}`));
    }
    const newest = created[3]!;
    await db
      .update(tasks)
      .set({ updatedAt: new Date("2099-01-01T00:00:00Z") })
      .where(eq(tasks.id, newest.id));

    const { goals: goalResults, tasks: taskResults } = await findLinkTargets(
      user.id,
      "",
    );
    expect(goalResults).toEqual([]);
    expect(taskResults).toHaveLength(LINK_PICKER_LIMIT);
    expect(taskResults[0]!.targetId).toBe(newest.id);
  });
});

describe("getLinkTarget", () => {
  it("returns the user's goal or task, and null for anyone else's", async () => {
    const user = await newUser();
    const other = await newUser();
    const goal = await newGoal(user.id);
    const task = await newTask(user.id);
    expect(await getLinkTarget(user.id, "goal", goal.id)).toMatchObject({
      title: "Run a 10k",
    });
    expect(await getLinkTarget(user.id, "task", task.id)).toMatchObject({
      title: "Book physio",
    });
    expect(await getLinkTarget(other.id, "goal", goal.id)).toBeNull();
    expect(await getLinkTarget(other.id, "task", task.id)).toBeNull();
    // An ID of the other kind is not found either.
    expect(await getLinkTarget(user.id, "task", goal.id)).toBeNull();
  });
});

describe("listLinkedNotes and countLinkedNotes", () => {
  it("list active notes most recently updated first, and count archived ones too", async () => {
    const user = await newUser();
    const goal = await newGoal(user.id);
    const older = await newNote(
      user.id,
      "Older",
      "x",
      new Date("2026-10-01T10:00:00Z"),
    );
    // 23:30 UTC is the next morning in Tokyo.
    const newer = await newNote(
      user.id,
      null,
      "y",
      new Date("2026-10-02T23:30:00Z"),
    );
    const archived = await newNote(user.id, "Archived");
    const unlinked = await newNote(user.id, "Not linked");
    for (const note of [older, newer, archived]) {
      await link(user.id, note.id, "goal", goal.id);
    }
    await archiveNote(user.id, { id: archived.id });

    const linked = await listLinkedNotes(user.id, {
      targetType: "goal",
      targetId: goal.id,
    });
    expect(linked).toEqual({
      notes: [
        {
          id: newer.id,
          title: null,
          updatedAt: newer.updatedAt,
          updatedLabel: "3 Oct 2026",
        },
        {
          id: older.id,
          title: "Older",
          updatedAt: older.updatedAt,
          updatedLabel: "1 Oct 2026",
        },
      ],
      linkCount: 3,
    });
    expect(linked.notes.map((note) => note.id)).not.toContain(unlinked.id);
    expect(await countLinkedNotes(user.id, "goal", [goal.id])).toEqual(
      new Map([[goal.id, 3]]),
    );
    expect(await countLinkedNotes(user.id, "goal", [])).toEqual(new Map());
  });

  it("show nothing of someone else's goal or task", async () => {
    const user = await newUser();
    const other = await newUser();
    const goal = await newGoal(user.id);
    const task = await newTask(user.id);
    const note = await newNote(user.id, "Mine");
    await link(user.id, note.id, "goal", goal.id);
    await link(user.id, note.id, "task", task.id);

    for (const owner of [
      { targetType: "goal" as const, targetId: goal.id },
      { targetType: "task" as const, targetId: task.id },
    ]) {
      expect(await listLinkedNotes(other.id, owner)).toEqual({
        notes: [],
        linkCount: 0,
      });
      expect(
        await countLinkedNotes(other.id, owner.targetType, [owner.targetId]),
      ).toEqual(new Map());
    }
  });
});

describe("findNotesToLink", () => {
  it("finds active notes not linked yet by title or text, ignoring case, the user's only", async () => {
    const user = await newUser();
    const other = await newUser();
    const goal = await newGoal(user.id);
    const byTitle = await newNote(user.id, "Knee exercises", "Daily");
    const byText = await newNote(user.id, "Physio", "Ask about the KNEE");
    const alreadyLinked = await newNote(user.id, "Knee scan");
    const archived = await newNote(user.id, "Knee brace");
    await newNote(user.id, "Shopping", "Milk");
    await newNote(other.id, "Knee too");
    await link(user.id, alreadyLinked.id, "goal", goal.id);
    await archiveNote(user.id, { id: archived.id });

    const found = await findNotesToLink(user.id, {
      targetType: "goal",
      targetId: goal.id,
      query: "knee",
    });
    expect(found.map((note) => note.id).sort()).toEqual(
      [byTitle.id, byText.id].sort(),
    );
    expect(found.find((note) => note.id === byText.id)).toMatchObject({
      title: "Physio",
      preview: "Ask about the KNEE",
      archivedLabel: null,
    });

    // Linked to this goal only: another target still offers it.
    const task = await newTask(user.id);
    expect(
      (
        await findNotesToLink(user.id, {
          targetType: "task",
          targetId: task.id,
          query: "knee",
        })
      ).map((note) => note.id),
    ).toContain(alreadyLinked.id);
  });

  it("lists the most recent notes, up to the limit, for an empty query", async () => {
    const user = await newUser();
    const goal = await newGoal(user.id);
    for (let index = 0; index < LINK_PICKER_LIMIT + 1; index += 1) {
      await newNote(
        user.id,
        `Note ${index}`,
        "x",
        new Date(Date.UTC(2026, 9, 1, index)),
      );
    }
    const found = await findNotesToLink(user.id, {
      targetType: "goal",
      targetId: goal.id,
      query: "",
    });
    expect(found).toHaveLength(LINK_PICKER_LIMIT);
    expect(found[0]!.title).toBe(`Note ${LINK_PICKER_LIMIT}`);
  });
});

describe("goal queries", () => {
  it("show the goal's linked notes and count every link for the delete confirmation", async () => {
    const user = await newUser();
    const goal = await newGoal(user.id);
    const active = await newNote(user.id, "Active note");
    const archived = await newNote(user.id, "Archived note");
    await link(user.id, active.id, "goal", goal.id);
    await link(user.id, archived.id, "goal", goal.id);
    await archiveNote(user.id, { id: archived.id });

    const detail = await getGoalDetail(user.id, goal.id);
    expect(detail?.notes.map((note) => note.id)).toEqual([active.id]);
    expect(detail?.noteLinkCount).toBe(2);

    await db
      .update(goals)
      .set({ status: "archived", statusChangedAt: new Date() })
      .where(eq(goals.id, goal.id));
    const [archivedGoal] = await getArchivedGoals(user.id);
    expect(archivedGoal).toMatchObject({ id: goal.id, noteLinkCount: 2 });
  });

  it("deleting the goal keeps its notes, only unlinked", async () => {
    const user = await newUser();
    const goal = await newGoal(user.id);
    const note = await newNote(user.id, "Kept");
    await link(user.id, note.id, "goal", goal.id);
    await deleteGoal(user.id, { id: goal.id });
    expect(await db.select().from(notes)).toHaveLength(1);
    expect(await listNoteLinks(user.id, note.id)).toEqual([]);
  });
});

describe("link actions", () => {
  it("refuse a signed-out caller", async () => {
    const id = "8f0d6c1e-1f7a-4a52-9a07-2d4b6f0f3c11";
    const target = { targetType: "goal" as const, targetId: id };
    for (const result of [
      await actions.linkNote({ id, ...target }),
      await actions.unlinkNote({ id, ...target }),
      await actions.getNoteLinks({ id }),
      await actions.findLinkTargets({ query: "x" }),
      await actions.getLinkedNotes(target),
      await actions.findNotesToLink({ ...target, query: "x" }),
      await taskActions.deleteTask({ id }),
    ]) {
      expect(result).toMatchObject({
        ok: false,
        error: { code: "UNAUTHENTICATED" },
      });
    }
  });

  it("link, list and unlink the user's own note, goal and task only", async () => {
    const user = await newUser();
    const other = await newUser();
    const note = await newNote(user.id, "Plan");
    const goal = await newGoal(user.id);
    const task = await newTask(user.id);
    const foreignNote = await newNote(other.id, "Theirs");
    const foreignGoal = await newGoal(other.id);
    await signInAs(user.id);

    expect(
      await actions.linkNote({
        id: note.id,
        targetType: "goal",
        targetId: goal.id,
      }),
    ).toEqual({ ok: true, data: undefined });
    expect(
      await actions.linkNote({
        id: note.id,
        targetType: "task",
        targetId: task.id,
      }),
    ).toMatchObject({ ok: true });
    const links = await actions.getNoteLinks({ id: note.id });
    expect(links.ok && links.data.map((target) => target.targetId)).toEqual([
      goal.id,
      task.id,
    ]);
    const linked = await actions.getLinkedNotes({
      targetType: "task",
      targetId: task.id,
    });
    expect(linked.ok && linked.data.linkCount).toBe(1);

    for (const result of [
      await actions.linkNote({
        id: note.id,
        targetType: "goal",
        targetId: foreignGoal.id,
      }),
      await actions.linkNote({
        id: foreignNote.id,
        targetType: "goal",
        targetId: goal.id,
      }),
      await actions.unlinkNote({
        id: foreignNote.id,
        targetType: "goal",
        targetId: goal.id,
      }),
      await actions.getNoteLinks({ id: foreignNote.id }),
    ]) {
      // getNoteLinks of someone else's note lists nothing rather than failing.
      if (result.ok) expect(result.data).toEqual([]);
      else expect(result.error.code).toBe("NOT_FOUND");
    }

    expect(
      await actions.unlinkNote({
        id: note.id,
        targetType: "goal",
        targetId: goal.id,
      }),
    ).toMatchObject({ ok: true });
    const after = await actions.getNoteLinks({ id: note.id });
    expect(after.ok && after.data.map((target) => target.targetId)).toEqual([
      task.id,
    ]);
    expect(await db.select().from(noteGoals)).toEqual([]);
  });

  it("search through actions, refusing a search over 200 characters", async () => {
    const user = await newUser();
    const goal = await newGoal(user.id, "Garden");
    await newNote(user.id, "Seeds to order");
    await signInAs(user.id);

    const targets = await actions.findLinkTargets({ query: "  gard  " });
    expect(targets.ok && targets.data.goals.map((g) => g.targetId)).toEqual([
      goal.id,
    ]);
    const found = await actions.findNotesToLink({
      targetType: "goal",
      targetId: goal.id,
      query: "seeds",
    });
    expect(found.ok && found.data.map((note) => note.title)).toEqual([
      "Seeds to order",
    ]);
    for (const result of [
      await actions.findLinkTargets({ query: "x".repeat(201) }),
      await actions.findNotesToLink({
        targetType: "goal",
        targetId: goal.id,
        query: "x".repeat(201),
      }),
    ]) {
      expect(result).toMatchObject({
        ok: false,
        error: { code: "VALIDATION" },
      });
    }
  });

  it("autosave links a new note through the action, and refuses linkTo on a later save", async () => {
    const user = await newUser();
    const goal = await newGoal(user.id);
    await signInAs(user.id);
    const created = await actions.saveNote({
      title: "From the goal",
      body: doc("Text"),
      expectedUpdatedAt: null,
      linkTo: { targetType: "goal", targetId: goal.id },
    });
    expect(created.ok).toBe(true);
    if (!created.ok || !created.data) throw new Error("Expected a note");
    expect(
      await listLinkedNotes(user.id, { targetType: "goal", targetId: goal.id }),
    ).toMatchObject({ linkCount: 1 });

    const later = await actions.saveNote({
      id: created.data.id,
      title: "From the goal",
      body: doc("More"),
      expectedUpdatedAt: created.data.updatedAt,
      linkTo: { targetType: "goal", targetId: goal.id },
    });
    expect(later).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });
});

describe("deleteTask action", () => {
  it("deletes the user's own task and keeps its notes, only unlinked", async () => {
    const user = await newUser();
    const other = await newUser();
    const task = await newTask(user.id);
    const foreignTask = await newTask(other.id);
    const note = await newNote(user.id, "Kept");
    await link(user.id, note.id, "task", task.id);
    await signInAs(user.id);

    expect(await taskActions.deleteTask({ id: foreignTask.id })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
    expect(await taskActions.deleteTask({ id: task.id })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(
      await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(eq(tasks.userId, user.id)),
    ).toEqual([]);
    expect(await db.select().from(tasks)).toHaveLength(1);
    expect(await db.select().from(notes)).toHaveLength(1);
    expect(await db.select().from(noteTasks)).toEqual([]);
    // Unlinking by delete writes no event: the note's history keeps its link.
    expect((await eventsOf(note.id)).map((event) => event.type).sort()).toEqual(
      ["note.created", "note.linked"],
    );
  });
});
