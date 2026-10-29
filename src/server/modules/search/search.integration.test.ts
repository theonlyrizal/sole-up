import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { NoteDocument } from "@/lib/notes/document";
import {
  HIGHLIGHT_START as S,
  HIGHLIGHT_STOP as E,
  SEARCH_GROUP_LIMIT,
  SEARCH_QUERY_EMPTY,
  SEARCH_QUERY_MAX,
  SEARCH_QUERY_TOO_LONG,
  withoutHighlights,
} from "@/lib/search";
import { db } from "@/server/db/client";
import {
  auditEvents,
  goals,
  notes,
  tasks,
  userPreferences,
} from "@/server/db/schema";
import { changeGoalStatus, createGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";
import {
  archiveNote,
  restoreNote,
  saveNote,
} from "@/server/modules/notes/service";
import { saveNoteSchema } from "@/server/modules/notes/validation";
import { changeTaskStatus, createTask } from "@/server/modules/tasks/service";
import { createTaskSchema } from "@/server/modules/tasks/validation";

import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import * as actions from "./actions";
import { search, type SearchResults } from "./queries";

// Search (chunk 8.4, ADR 0016): notes, goal titles and task titles, each
// scoped to the user, with English stemming, ranking, highlights and the
// Server Action's validation.

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
  text: string,
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

const newGoal = (userId: string, title: string) =>
  createGoal(userId, createGoalSchema.parse({ title }));

const newTask = (userId: string, title: string) =>
  createTask(userId, createTaskSchema.parse({ title }));

async function results(userId: string, query: string) {
  const found = await search(userId, query);
  if (found.status !== "results") throw new Error("Expected results");
  return found;
}

/** Each group's titles as plain text, in order. */
function titlesOf(found: Extract<SearchResults, { status: "results" }>) {
  return {
    notes: found.notes.map((hit) =>
      hit.titleHighlight === null
        ? null
        : withoutHighlights(hit.titleHighlight),
    ),
    goals: found.goals.map((hit) => withoutHighlights(hit.titleHighlight)),
    tasks: found.tasks.map((hit) => withoutHighlights(hit.titleHighlight)),
  };
}

describe("search", () => {
  it("finds notes, goals and tasks by stem: “run” finds “running”", async () => {
    const user = await newUser();
    const note = await newNote(user.id, "Training", "I went running at dawn");
    const goal = await newGoal(user.id, "Running club");
    const task = await newTask(user.id, "Runs on Saturday");
    await newNote(user.id, "Shopping", "Milk and eggs");
    await newGoal(user.id, "Read more");
    await newTask(user.id, "Call the bank");

    const found = await results(user.id, "run");
    expect(found.notes.map((hit) => hit.id)).toEqual([note.id]);
    expect(found.goals.map((hit) => hit.id)).toEqual([goal.id]);
    expect(found.tasks.map((hit) => hit.task.id)).toEqual([task.id]);
    expect(found.notes[0]).toMatchObject({
      titleHighlight: "Training",
      // An excerpt starts at a word that counts: "I" is a stop word.
      excerptHighlight: `went ${S}running${E} at dawn`,
      updatedLabel: expect.any(String),
    });
    expect(found.goals[0]).toMatchObject({
      titleHighlight: `${S}Running${E} club`,
      statusLabel: "Active",
    });
    expect(found.tasks[0]).toMatchObject({
      titleHighlight: `${S}Runs${E} on Saturday`,
      statusLabel: "Open",
      task: { id: task.id, title: "Runs on Saturday", status: "open" },
    });
  });

  it("returns only the current user's notes, goals and tasks", async () => {
    const owner = await newUser();
    const other = await newUser();
    const ownNote = await newNote(owner.id, "Garden plan", "Plant tomatoes");
    const ownGoal = await newGoal(owner.id, "Grow tomatoes");
    const ownTask = await newTask(owner.id, "Buy tomato seeds");
    await newNote(other.id, "Tomatoes", "Someone else's tomatoes");
    await newGoal(other.id, "Sell tomatoes");
    await newTask(other.id, "Water the tomatoes");

    const found = await results(owner.id, "tomato");
    expect(found.notes.map((hit) => hit.id)).toEqual([ownNote.id]);
    expect(found.goals.map((hit) => hit.id)).toEqual([ownGoal.id]);
    expect(found.tasks.map((hit) => hit.task.id)).toEqual([ownTask.id]);

    // And the other way round.
    const theirs = titlesOf(await results(other.id, "tomato"));
    expect(theirs).toEqual({
      notes: ["Tomatoes"],
      goals: ["Sell tomatoes"],
      tasks: ["Water the tomatoes"],
    });
  });

  it("leaves archived notes out until they are restored", async () => {
    const user = await newUser();
    const note = await newNote(user.id, "Packing list", "Passport and charger");
    await archiveNote(user.id, { id: note.id });
    expect((await results(user.id, "passport")).notes).toEqual([]);

    await restoreNote(user.id, { id: note.id });
    expect(
      (await results(user.id, "passport")).notes.map((hit) => hit.id),
    ).toEqual([note.id]);
  });

  it("finds goals and tasks of every status, each shown", async () => {
    const user = await newUser();
    const goal = await newGoal(user.id, "Learn piano");
    await changeGoalStatus(user.id, { id: goal.id, status: "completed" });
    const task = await newTask(user.id, "Tune the piano");
    await changeTaskStatus(user.id, { id: task.id, status: "cancelled" });

    const found = await results(user.id, "piano");
    expect(found.goals.map((hit) => hit.statusLabel)).toEqual(["Completed"]);
    expect(found.tasks.map((hit) => hit.statusLabel)).toEqual(["Cancelled"]);
  });

  it("ranks a note's title above its body, then the most recently updated", async () => {
    const user = await newUser();
    const inBody = await newNote(
      user.id,
      "Weekend",
      "Thinking about budget",
      new Date("2026-10-03T00:00:00Z"),
    );
    const olderTitle = await newNote(
      user.id,
      "Budget",
      "Numbers",
      new Date("2026-10-01T00:00:00Z"),
    );
    const newerTitle = await newNote(
      user.id,
      "Budget",
      "More numbers",
      new Date("2026-10-02T00:00:00Z"),
    );

    expect(
      (await results(user.id, "budget")).notes.map((hit) => hit.id),
    ).toEqual([newerTitle.id, olderTitle.id, inBody.id]);
  });

  it("ranks goals and tasks by relevance, then the most recently updated", async () => {
    const user = await newUser();
    const once = await newGoal(user.id, "Swim and stretch");
    const twice = await newGoal(user.id, "Swim, swim, swim");
    expect((await results(user.id, "swim")).goals.map((hit) => hit.id)).toEqual(
      [twice.id, once.id],
    );

    const first = await newTask(user.id, "Pack bag");
    const second = await newTask(user.id, "Pack lunch");
    await db
      .update(tasks)
      .set({ updatedAt: new Date("2026-01-01T00:00:00Z") })
      .where(eq(tasks.id, second.id));
    expect(
      (await results(user.id, "pack")).tasks.map((hit) => hit.task.id),
    ).toEqual([first.id, second.id]);
  });

  it("shows at most SEARCH_GROUP_LIMIT results per group", async () => {
    const user = await newUser();
    for (let index = 0; index <= SEARCH_GROUP_LIMIT; index += 1) {
      await newTask(user.id, `Invoice ${index}`);
    }
    expect((await results(user.id, "invoice")).tasks).toHaveLength(
      SEARCH_GROUP_LIMIT,
    );
  });

  it("supports quoted phrases, OR and -word", async () => {
    const user = await newUser();
    await newTask(user.id, "Call mum");
    await newTask(user.id, "Call the dentist");
    await newTask(user.id, "Email the dentist");

    expect(
      titlesOf(await results(user.id, '"call the dentist"')).tasks,
    ).toEqual(["Call the dentist"]);
    expect(titlesOf(await results(user.id, "call -dentist")).tasks).toEqual([
      "Call mum",
    ]);
    expect(
      titlesOf(await results(user.id, "mum or email")).tasks.sort(),
    ).toEqual(["Call mum", "Email the dentist"]);
  });

  it("says there was nothing to search for when the query holds only stop words", async () => {
    const user = await newUser();
    await newNote(user.id, "The and of", "the and of");
    expect(await search(user.id, "the and of")).toEqual({
      status: "nothing_to_search",
    });
    expect(await search(user.id, "!!! ???")).toEqual({
      status: "nothing_to_search",
    });
  });

  it("returns empty groups when nothing matches", async () => {
    const user = await newUser();
    await newNote(user.id, "Recipes", "Soup");
    expect(await search(user.id, "spaceship")).toEqual({
      status: "results",
      notes: [],
      goals: [],
      tasks: [],
    });
  });

  it("keeps markup in stored text as text, and removes the delimiters from titles", async () => {
    const user = await newUser();
    const note = await newNote(
      user.id,
      "<b>Script</b> notes",
      "Never run <script>alert(1)</script> here",
    );
    const goal = await newGoal(user.id, "Script writing");
    // Titles may hold control characters; the delimiters must not survive.
    await db
      .update(goals)
      .set({ title: `Script${S} writing${E}` })
      .where(eq(goals.id, goal.id));
    await db
      .update(notes)
      .set({ title: `<b>Script</b>${E} notes` })
      .where(eq(notes.id, note.id));

    const found = await results(user.id, "script");
    expect(found.notes[0]!.titleHighlight).toBe(`<b>${S}Script${E}</b> notes`);
    // Excerpts leave tag-like words out (Postgres's parser reads them as
    // tags); titles keep them. Either way the page renders text only.
    expect(found.notes[0]!.excerptHighlight).toBe(`Never run  alert(1)  here`);
    expect(found.goals[0]!.titleHighlight).toBe(`${S}Script${E} writing`);
  });

  it("highlights an untitled note's text, and starts the excerpt of a title-only match", async () => {
    const user = await newUser();
    await newNote(user.id, null, "Ideas for the garden shed");
    await newNote(user.id, "Shed", "Measure the walls first");

    const found = await results(user.id, "shed");
    const untitled = found.notes.find((hit) => hit.titleHighlight === null)!;
    expect(untitled.excerptHighlight).toBe(`Ideas for the garden ${S}shed${E}`);
    const titled = found.notes.find((hit) => hit.titleHighlight !== null)!;
    expect(titled.titleHighlight).toBe(`${S}Shed${E}`);
    expect(titled.excerptHighlight).toBe("Measure the walls first");
  });

  it("writes no audit events", async () => {
    const user = await newUser();
    await newNote(user.id, "Search me", "Body");
    const [before] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditEvents);
    await search(user.id, "search");
    const [after] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditEvents);
    expect(after).toEqual(before);
  });
});

describe("the title search indexes", () => {
  it("serve the queries' title expression for goals and tasks", async () => {
    for (const table of ["goals", "tasks"] as const) {
      const plan = await db.transaction(async (tx) => {
        await tx.execute(sql`set local enable_seqscan = off`);
        const { rows } = await tx.execute<{ "QUERY PLAN": string }>(
          sql.raw(
            `explain select id from "${table}" where to_tsvector('english', "${table}"."title") @@ websearch_to_tsquery('english', 'run')`,
          ),
        );
        return rows.map((row) => row["QUERY PLAN"]).join("\n");
      });
      expect(plan).toContain(`${table}_title_search_idx`);
    }
  });
});

describe("the search action", () => {
  it("refuses a caller who isn't signed in", async () => {
    expect(await actions.search({ query: "run" })).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });
  });

  it("refuses an empty or too long query, and allows SEARCH_QUERY_MAX characters", async () => {
    const user = await newUser();
    await signInAs(user.id);

    for (const query of ["", "   "]) {
      expect(await actions.search({ query })).toMatchObject({
        ok: false,
        error: {
          code: "VALIDATION",
          fieldErrors: { query: [SEARCH_QUERY_EMPTY] },
        },
      });
    }
    expect(
      await actions.search({ query: "a".repeat(SEARCH_QUERY_MAX + 1) }),
    ).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: { query: [SEARCH_QUERY_TOO_LONG] },
      },
    });
    expect(
      await actions.search({ query: ` ${"a".repeat(SEARCH_QUERY_MAX)} ` }),
    ).toMatchObject({ ok: true });
  });

  it("searches the signed-in user's data only, whatever is sent", async () => {
    const owner = await newUser();
    const other = await newUser();
    await newNote(other.id, "Holiday", "Flights to Lisbon");
    await newGoal(other.id, "Holiday fund");
    await newTask(other.id, "Book holiday");
    const own = await newTask(owner.id, "Plan holiday");
    await signInAs(owner.id);

    const result = await actions.search({ query: "  holiday " });
    expect(result).toMatchObject({
      ok: true,
      data: { status: "results", notes: [], goals: [] },
    });
    if (!result.ok || result.data.status !== "results") throw new Error();
    expect(result.data.tasks.map((hit) => hit.task.id)).toEqual([own.id]);

    // Extra fields, a user ID among them, are refused.
    expect(
      await actions.search({
        query: "holiday",
        userId: other.id,
      } as unknown as { query: string }),
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } });
  });
});
