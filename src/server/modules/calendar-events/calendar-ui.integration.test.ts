import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AgendaEntry } from "@/lib/agenda";
import { instantFromLocal, localDateOf } from "@/lib/dates";
import { db } from "@/server/db/client";
import {
  auditEvents,
  calendarEventExceptions,
  calendarEvents,
} from "@/server/db/schema";
import { createGoal } from "@/server/modules/goals/service";
import { createGoalSchema } from "@/server/modules/goals/validation";
import { createLifeArea } from "@/server/modules/life-areas/service";
import { createLifeAreaSchema } from "@/server/modules/life-areas/validation";

import {
  asUser,
  createTestUser,
} from "../../../../tests/integration/helpers/users";
import * as actions from "./actions";
import { listAgenda, listEventLinkOptions } from "./queries";

// The event dialog's server side (chunk 4.4): the actions it calls, the
// scope prompt's previews (which must change nothing), and the events on
// the calendar page's Agenda (4.5; its tasks are in agenda.integration).

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

const NEW_YORK = "America/New_York";
const TOKYO = "Asia/Tokyo";

/** The form as the dialog sends it: a weekly 09:00–10:00 standup in New York. */
const standup = (fields: Record<string, unknown> = {}) => ({
  title: "Standup",
  description: "",
  location: "",
  allDay: false,
  startDate: "2026-11-02",
  startTime: "09:00",
  endDate: "2026-11-02",
  endTime: "10:00",
  tz: NEW_YORK,
  goalId: null,
  lifeAreaId: null,
  rrule: "FREQ=WEEKLY;BYDAY=MO",
  ...fields,
});

/** The original start of the standup on a Monday, as the dialog sends it. */
const monday = (date: string) =>
  instantFromLocal(date, "09:00", NEW_YORK).toISOString();

/** An Agenda row's first local day in Tokyo. */
function startDay(entry: AgendaEntry): string {
  return entry.allDay ? entry.start : localDateOf(new Date(entry.start), TOKYO);
}

async function snapshot() {
  return {
    events: await db.select().from(calendarEvents),
    exceptions: await db.select().from(calendarEventExceptions),
    audit: await db.select().from(auditEvents),
  };
}

/** The "this" form omits the rule (strict schema). */
function thisScope<T extends { rrule?: unknown }>(form: T): Omit<T, "rrule"> {
  const rest = { ...form };
  delete rest.rrule;
  return rest;
}

async function createStandupWithExceptions(userId: string) {
  await signInAs(userId);
  const created = await actions.createCalendarEvent(standup());
  if (!created.ok) throw new Error("create failed");
  const id = created.data.id;
  // 9 Nov moved to 11:00; 16 Nov deleted.
  const moved = await actions.editCalendarEventOccurrence({
    ...thisScope(
      standup({
        startDate: "2026-11-09",
        endDate: "2026-11-09",
        startTime: "11:00",
        endTime: "12:00",
      }),
    ),
    id,
    originalStart: monday("2026-11-09"),
    scope: "this",
  });
  expect(moved.ok).toBe(true);
  const cancelled = await actions.deleteCalendarEventOccurrence({
    id,
    originalStart: monday("2026-11-16"),
    scope: "this",
  });
  expect(cancelled.ok).toBe(true);
  return id;
}

describe("event actions", () => {
  it("creates a series and reports field errors, including the rule's", async () => {
    const user = await createTestUser();
    await signInAs(user.id);

    const created = await actions.createCalendarEvent(standup());
    expect(created).toMatchObject({
      ok: true,
      data: { title: "Standup", rrule: "FREQ=WEEKLY;BYDAY=MO", tz: NEW_YORK },
    });

    const invalid = await actions.createCalendarEvent(
      standup({ title: " ", endTime: "08:00", rrule: "FREQ=HOURLY" }),
    );
    expect(invalid).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: {
          title: ["Give the event a title."],
          rrule: ["Repeat daily, weekly, monthly or yearly."],
        },
      },
    });

    const endBeforeStart = await actions.createCalendarEvent(
      standup({ endTime: "08:00", rrule: null }),
    );
    expect(endBeforeStart).toMatchObject({
      ok: false,
      error: { fieldErrors: { endTime: ["End after the start."] } },
    });
  });

  it("refuses anonymous callers and a series edited as a one-off", async () => {
    expect(await actions.createCalendarEvent(standup())).toMatchObject({
      ok: false,
      error: { code: "UNAUTHENTICATED" },
    });

    const user = await createTestUser();
    await signInAs(user.id);
    const created = await actions.createCalendarEvent(standup());
    if (!created.ok) throw new Error("create failed");
    expect(
      await actions.updateCalendarEvent({ id: created.data.id, ...standup() }),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });

  it("keeps an all-day end inclusive in the form", async () => {
    const user = await createTestUser();
    await signInAs(user.id);
    const created = await actions.createCalendarEvent({
      title: "Conference",
      allDay: true,
      startDate: "2026-11-04",
      endDate: "2026-11-06",
      startTime: null,
      endTime: null,
      tz: null,
      rrule: null,
    });
    expect(created).toMatchObject({
      ok: true,
      data: { allDay: true, startDate: "2026-11-04", endDate: "2026-11-07" },
    });
  });
});

describe("scope previews", () => {
  it("name the exceptions an edit would drop and change nothing", async () => {
    const user = await createTestUser();
    const id = await createStandupWithExceptions(user.id);
    const before = await snapshot();

    // Every other Monday from 2 Nov: 9 Nov has no occurrence any more, so
    // its edit is dropped; 16 Nov still has one and stays deleted.
    const fortnightly = {
      ...standup({ rrule: "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO" }),
      id,
      originalStart: monday("2026-11-02"),
    };
    const preview = await actions.previewCalendarEventOccurrenceEdit({
      ...fortnightly,
      scope: "all",
    });
    expect(preview.ok).toBe(true);
    const dropped = preview.ok ? preview.data.dropped : [];
    expect(
      dropped.map(({ kind, originalStart }) => ({ kind, originalStart })),
    ).toEqual([
      { kind: "modified", originalStart: new Date(monday("2026-11-09")) },
    ]);
    expect(await snapshot()).toEqual(before);

    // Saving gives the same answer.
    const saved = await actions.editCalendarEventOccurrence({
      ...fortnightly,
      scope: "all",
    });
    expect(saved.ok && saved.data.dropped.map(({ id }) => id).sort()).toEqual(
      dropped.map(({ id }) => id).sort(),
    );
  });

  it("pass validation errors through, as saving would", async () => {
    const user = await createTestUser();
    const id = await createStandupWithExceptions(user.id);
    const preview = await actions.previewCalendarEventOccurrenceEdit({
      ...standup({
        startDate: "2026-11-23",
        endDate: "2026-11-23",
        rrule: "FREQ=WEEKLY;BYDAY=MO;UNTIL=20261101",
      }),
      id,
      originalStart: monday("2026-11-23"),
      scope: "following",
    });
    expect(preview).toMatchObject({
      ok: false,
      error: {
        fieldErrors: { rrule: ["End the repeat on or after the start date."] },
      },
    });

    const thisEvent = await actions.previewCalendarEventOccurrenceEdit({
      ...thisScope(standup({ tz: TOKYO })),
      id,
      originalStart: monday("2026-11-23"),
      scope: "this",
    });
    expect(thisEvent).toMatchObject({
      ok: false,
      error: { fieldErrors: { tz: [expect.stringContaining("time zone")] } },
    });
  });

  it("name what a delete would drop and change nothing", async () => {
    const user = await createTestUser();
    const id = await createStandupWithExceptions(user.id);
    const before = await snapshot();

    const following = await actions.previewCalendarEventOccurrenceDelete({
      id,
      originalStart: monday("2026-11-09"),
      scope: "following",
    });
    expect(
      following.ok && following.data.dropped.map(({ kind }) => kind).sort(),
    ).toEqual(["cancelled", "modified"]);
    const fromLater = await actions.previewCalendarEventOccurrenceDelete({
      id,
      originalStart: monday("2026-11-23"),
      scope: "following",
    });
    expect(fromLater).toEqual({ ok: true, data: { dropped: [] } });
    expect(await snapshot()).toEqual(before);
  });

  it("are not found for another user's series", async () => {
    const owner = await createTestUser();
    const id = await createStandupWithExceptions(owner.id);
    const before = await snapshot();
    const stranger = await createTestUser();
    await signInAs(stranger.id);

    const edit = await actions.previewCalendarEventOccurrenceEdit({
      ...standup(),
      id,
      originalStart: monday("2026-11-02"),
      scope: "all",
    });
    const remove = await actions.previewCalendarEventOccurrenceDelete({
      id,
      originalStart: monday("2026-11-02"),
      scope: "all",
    });
    expect(edit).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(remove).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(
      await actions.deleteCalendarEventOccurrence({
        id,
        originalStart: monday("2026-11-02"),
        scope: "all",
      }),
    ).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(await snapshot()).toEqual(before);
  });
});

describe("calendar page queries", () => {
  it("put events on the Agenda by the user's local day", async () => {
    const user = await createTestUser();
    await signInAs(user.id);
    await actions.createCalendarEvent(standup());
    // 09:00 in New York is 23:00 in Tokyo, the same day.
    await actions.createCalendarEvent(
      standup({
        title: "Late call",
        rrule: null,
        startTime: "11:00",
        endTime: "12:00",
      }),
    );
    await actions.createCalendarEvent({
      title: "Holiday",
      allDay: true,
      startDate: "2026-10-30",
      endDate: "2026-11-03",
      rrule: null,
    });
    const other = await createTestUser();
    await signInAs(other.id);
    await actions.createCalendarEvent(standup({ title: "Not mine" }));

    const entries = await listAgenda(
      user.id,
      { start: "2026-11-02", days: 30 },
      TOKYO,
    );
    const summary = entries
      .map((entry) => `${startDay(entry)} ${entry.title}`)
      .sort();
    // 11:00 in New York is 01:00 the next day in Tokyo. The holiday began
    // before the range and is still on it (FullCalendar shows it from the
    // range's first day). Another user's event is not.
    expect(summary).toEqual([
      "2026-10-30 Holiday",
      "2026-11-02 Standup",
      "2026-11-03 Late call",
      "2026-11-09 Standup",
      "2026-11-16 Standup",
      "2026-11-23 Standup",
      "2026-11-30 Standup",
    ]);
  });

  it("offer the user's goals with their areas", async () => {
    const user = await createTestUser();
    const area = await createLifeArea(
      user.id,
      createLifeAreaSchema.parse({ name: "Health" }),
    );
    const goal = await createGoal(
      user.id,
      createGoalSchema.parse({ title: "Run", lifeAreaId: area.id }),
    );
    const other = await createTestUser();
    await createGoal(other.id, createGoalSchema.parse({ title: "Not mine" }));

    expect(await listEventLinkOptions(user.id)).toEqual({
      goals: [
        { id: goal.id, title: "Run", status: "active", lifeAreaId: area.id },
      ],
      areas: [{ id: area.id, name: "Health", status: "active" }],
    });
  });

  it("show a cancelled occurrence as gone", async () => {
    const user = await createTestUser();
    const id = await createStandupWithExceptions(user.id);
    const entries = await listAgenda(
      user.id,
      { start: "2026-11-02", days: 30 },
      NEW_YORK,
    );
    const standups = entries.flatMap((entry) =>
      entry.kind === "event" && entry.event.id === id ? [entry.event] : [],
    );
    expect(standups.slice(0, 3).map((event) => event.modified)).toEqual([
      false,
      true,
      false,
    ]);
    expect(
      standups.some(
        (event) =>
          event.originalStart instanceof Date &&
          event.originalStart.toISOString() === monday("2026-11-16"),
      ),
    ).toBe(false);
    const [row] = await db
      .select()
      .from(calendarEvents)
      .where(eq(calendarEvents.id, id));
    expect(row?.userId).toBe(user.id);
  });
});
