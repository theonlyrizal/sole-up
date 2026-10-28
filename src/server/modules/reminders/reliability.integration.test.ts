import { createECDH, randomBytes, randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";
import webpush from "web-push";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { instantFromLocal } from "@/lib/dates";
import { db } from "@/server/db/client";
import {
  pushSubscriptions,
  reminders,
  userPreferences,
} from "@/server/db/schema";
import { createCalendarEvent } from "@/server/modules/calendar-events/service";
import { createCalendarEventSchema } from "@/server/modules/calendar-events/validation";
import {
  savePreferences,
  setDailyNudgeTime,
} from "@/server/modules/preferences/service";
import { setDailyNudgeTimeSchema } from "@/server/modules/preferences/validation";
import { createTask } from "@/server/modules/tasks/service";
import { createTaskSchema } from "@/server/modules/tasks/validation";

import { captureLogs } from "../../../../tests/helpers/logs";
import { createTestUser } from "../../../../tests/integration/helpers/users";
import { runSweep } from "./sweep";
import { lastSweepAt, sweepHealth } from "./sweep-status";

// The reliability pass (chunk 5.7, ADR 0013): DST days, a time-zone
// change, far zones on a UTC server, missed sweeps, a sweep cut off part
// way, quiet hours on a DST night, and what a sweep leaves to see. Push is mocked at the library
// boundary (`web-push`'s sendNotification), as in 5.5's tests. A cut-off
// sweep is simulated by making `recordDelivery` throw after a given number
// of records, which leaves the rest of that user's claimed rows `sending`
// with their pushes possibly already sent, like a request killed mid-way.
const sendNotification = vi.hoisted(() => vi.fn());
vi.mock("web-push", async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof webpush }>();
  return { default: { ...actual.default, sendNotification } };
});

const cutOff = vi.hoisted(() => ({ after: Infinity, records: 0 }));
vi.mock("./record", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./record")>();
  return {
    ...actual,
    recordDelivery: async (
      ...args: Parameters<typeof actual.recordDelivery>
    ) => {
      if (cutOff.records++ >= cutOff.after) throw new Error("cut off");
      return actual.recordDelivery(...args);
    },
  };
});

const NEW_YORK = "America/New_York";
const KIRITIMATI = "Pacific/Kiritimati"; // UTC+14
const PAGO_PAGO = "Pacific/Pago_Pago"; // UTC−11

type Form = Record<string, unknown>;

/** Each push sent, in order: the payload, and when the sweep sent it. */
const sent: { at: Date; payload: Record<string, string> }[] = [];
const sentTitles = () => sent.map(({ payload }) => payload.title);
const sentTimes = () => sent.map(({ at }) => at);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  sent.length = 0;
  sendNotification.mockReset();
  sendNotification.mockImplementation(async (_subscription, body) => {
    sent.push({ at: new Date(), payload: JSON.parse(body as string) });
    return { statusCode: 201 };
  });
  cutOff.after = Infinity;
  cutOff.records = 0;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// --- Fixtures ------------------------------------------------------------------

/** The UTC instant of a wall-clock time in `zone`, e.g. "2027-03-14 09:00". */
const local = (zone: string, when: string) => {
  const [date, time] = when.split(" ");
  return instantFromLocal(date!, time!, zone);
};
const iso = (value: string) => new Date(value);
/** An instant's wall-clock "YYYY-MM-DD HH:MM" in `zone`. */
const wallClock = (instant: Date, zone: string) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: zone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(instant);
const plusMinutes = (instant: Date, minutes: number) =>
  new Date(instant.getTime() + minutes * 60_000);

type ReminderPreferences = Partial<
  Pick<
    typeof userPreferences.$inferInsert,
    "remindersEnabled" | "quietHoursStart" | "quietHoursEnd"
  >
>;

/**
 * A user in `zone` (en-GB times, "14:00") with one subscribed device, set
 * up at `now` (the clock stays there for the fixtures that follow).
 */
async function setUp(
  zone: string,
  now: Date,
  preferences: ReminderPreferences = {},
) {
  vi.setSystemTime(now);
  const user = await createTestUser();
  await savePreferences(user.id, {
    timezone: zone,
    locale: "en-GB",
    weekStart: 1,
  });
  if (Object.keys(preferences).length > 0) {
    await db
      .update(userPreferences)
      .set(preferences)
      .where(eq(userPreferences.userId, user.id));
  }
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  await db.insert(pushSubscriptions).values({
    userId: user.id,
    endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
    p256dh: ecdh.getPublicKey().toString("base64url"),
    auth: randomBytes(16).toString("base64url"),
    userAgentLabel: "Chrome on Linux",
  });
  return user;
}

const timedTask = (
  userId: string,
  zone: string,
  due: string,
  fields: Form = {},
) => {
  const [dueDate, dueTime] = due.split(" ");
  return createTask(
    userId,
    createTaskSchema.parse({
      title: "Submit visa form",
      dueDate,
      dueTime,
      dueTz: zone,
      reminderOffsetMinutes: 0,
      ...fields,
    }),
  );
};

/** A daily repeating 30-minute event in `zone` from `start`. */
const dailyEvent = (
  userId: string,
  zone: string,
  start: string,
  fields: Form = {},
) => {
  const [startDate, startTime] = start.split(" ");
  const [, endTime] = wallClock(
    plusMinutes(local(zone, start), 30),
    zone,
  ).split(" ");
  return createCalendarEvent(
    userId,
    createCalendarEventSchema.parse({
      title: "Standup",
      allDay: false,
      startDate,
      startTime,
      endDate: startDate,
      endTime,
      tz: zone,
      rrule: "FREQ=DAILY",
      reminderOffsetMinutes: 10,
      ...fields,
    }),
  );
};

const nudgeAt = (userId: string, dailyNudgeTime: string) =>
  setDailyNudgeTime(userId, setDailyNudgeTimeSchema.parse({ dailyNudgeTime }));

/** Runs a sweep at `now`, with the clock there. */
async function sweepAt(now: Date) {
  vi.setSystemTime(now);
  return runSweep(now);
}

/**
 * Runs the sweep every 15 minutes, as cron-job.org does, on the UTC
 * quarter hours from `from` to `to` inclusive.
 */
async function sweepEvery15(from: Date, to: Date) {
  for (let now = from; now <= to; now = new Date(now.getTime() + 15 * 60_000)) {
    await sweepAt(now);
  }
}

const rowsOf = (userId: string) =>
  db
    .select()
    .from(reminders)
    .where(eq(reminders.userId, userId))
    .orderBy(asc(reminders.targetAt), asc(reminders.createdAt));

/** The one reminder row an item has, by task or event ID. */
const rowFor = async (userId: string, itemId: string) => {
  const rows = (await rowsOf(userId)).filter(
    (row) => row.taskId === itemId || row.eventId === itemId,
  );
  expect(rows).toHaveLength(1);
  return rows[0]!;
};

// --- DST transition days (America/New_York) ------------------------------------
//
// In 2027 New York springs forward on Sunday 14 March (02:00 EST → 03:00
// EDT, UTC−5 → UTC−4) and falls back on Sunday 7 November (02:00 EDT →
// 01:00 EST). A claim takes what fires strictly before the next sweep, so
// a reminder firing on a quarter hour goes out at that sweep.

describe("DST transition days in New York", () => {
  const at = (when: string) => local(NEW_YORK, when);

  it("reminds about a deadline at its local time on both transition days", async () => {
    const user = await setUp(NEW_YORK, at("2027-03-13 12:00"));
    const spring = await timedTask(user.id, NEW_YORK, "2027-03-14 09:00", {
      reminderOffsetMinutes: 60,
    });
    const fall = await timedTask(user.id, NEW_YORK, "2027-11-07 09:00", {
      reminderOffsetMinutes: 60,
    });

    // 09:00 EDT is 13:00 UTC; an hour before is 08:00 EDT.
    expect(await rowFor(user.id, spring.id)).toMatchObject({
      targetAt: iso("2027-03-14T13:00:00Z"),
      fireAt: iso("2027-03-14T12:00:00Z"),
    });
    // 09:00 EST is 14:00 UTC.
    expect(await rowFor(user.id, fall.id)).toMatchObject({
      targetAt: iso("2027-11-07T14:00:00Z"),
      fireAt: iso("2027-11-07T13:00:00Z"),
    });

    await sweepEvery15(at("2027-03-14 00:00"), at("2027-03-14 09:00"));
    await sweepEvery15(at("2027-11-07 00:00"), at("2027-11-07 09:00"));

    expect(sent.map(({ at: when, payload }) => [when, payload.title])).toEqual([
      [iso("2027-03-14T12:00:00Z"), "Due 09:00 · Submit visa form"],
      [iso("2027-11-07T13:00:00Z"), "Due 09:00 · Submit visa form"],
    ]);
  });

  it("fires a day-before reminder exactly 24 hours ahead, an hour off the wall clock across a transition", async () => {
    // ADR 0013 stores the offset in minutes (1440), so "1 day before" a
    // spring-forward 09:00 is 08:00 the day before.
    const user = await setUp(NEW_YORK, at("2027-03-12 12:00"));
    const task = await timedTask(user.id, NEW_YORK, "2027-03-14 09:00", {
      reminderOffsetMinutes: 1440,
    });

    expect((await rowFor(user.id, task.id)).fireAt).toEqual(
      at("2027-03-13 08:00"),
    );
  });

  it("keeps a daily event at 09:00 local across spring-forward, one reminder a day", async () => {
    const user = await setUp(NEW_YORK, at("2027-03-12 12:00"));
    await dailyEvent(user.id, NEW_YORK, "2027-03-12 09:00");

    await sweepEvery15(at("2027-03-13 08:00"), at("2027-03-15 09:00"));

    expect(sentTimes()).toEqual([
      iso("2027-03-13T13:45:00Z"), // 08:45 EST
      iso("2027-03-14T12:45:00Z"), // 08:45 EDT
      iso("2027-03-15T12:45:00Z"),
    ]);
    expect(new Set(sentTitles())).toEqual(
      new Set(["Standup · 09:00 (in 15 min)"]),
    );
    expect(
      (await rowsOf(user.id)).filter((row) => row.status === "scheduled"),
    ).toMatchObject([{ occurrenceStart: iso("2027-03-16T13:00:00Z") }]);
  });

  it("keeps a daily event at 09:00 local across fall-back", async () => {
    const user = await setUp(NEW_YORK, at("2027-11-05 12:00"));
    await dailyEvent(user.id, NEW_YORK, "2027-11-05 09:00");

    await sweepEvery15(at("2027-11-06 08:00"), at("2027-11-08 09:00"));

    expect(sentTimes()).toEqual([
      iso("2027-11-06T12:45:00Z"), // 08:45 EDT
      iso("2027-11-07T13:45:00Z"), // 08:45 EST
      iso("2027-11-08T13:45:00Z"),
    ]);
  });

  it("reminds once about an occurrence at a time spring-forward skips", async () => {
    // 02:30 doesn't exist on 14 March: the "compatible" rule moves it to
    // 03:30 EDT (07:30 UTC).
    const user = await setUp(NEW_YORK, at("2027-03-13 12:00"));
    await dailyEvent(user.id, NEW_YORK, "2027-03-13 02:30");

    await sweepEvery15(at("2027-03-14 00:00"), at("2027-03-14 06:00"));

    expect(sentTimes()).toEqual([iso("2027-03-14T07:15:00Z")]);
    expect(sentTitles()).toEqual(["Standup · 03:30 (in 15 min)"]);
  });

  it("reminds once about an occurrence at a time fall-back repeats", async () => {
    // 01:30 happens twice on 7 November; the occurrence is the first,
    // 01:30 EDT (05:30 UTC).
    const user = await setUp(NEW_YORK, at("2027-11-06 12:00"));
    await dailyEvent(user.id, NEW_YORK, "2027-11-06 01:30");

    await sweepEvery15(at("2027-11-07 00:00"), at("2027-11-07 04:00"));

    expect(sentTimes()).toEqual([iso("2027-11-07T05:15:00Z")]);
    expect(await rowsOf(user.id)).toMatchObject([
      { status: "sent", occurrenceStart: iso("2027-11-07T05:30:00Z") },
      // The next day's 01:30 is EST (06:30 UTC).
      { status: "scheduled", occurrenceStart: iso("2027-11-08T06:30:00Z") },
    ]);
  });

  it("sends the nudge at 08:00 local across spring-forward, once a day", async () => {
    const user = await setUp(NEW_YORK, at("2027-03-13 06:00"));
    await nudgeAt(user.id, "08:00");

    await sweepEvery15(at("2027-03-13 07:00"), at("2027-03-15 08:00"));

    expect(sent.map(({ at: when, payload }) => [when, payload.title])).toEqual([
      [iso("2027-03-13T13:00:00Z"), "Time to plan your day"], // 08:00 EST
      [iso("2027-03-14T12:00:00Z"), "Time to plan your day"], // 08:00 EDT
      [iso("2027-03-15T12:00:00Z"), "Time to plan your day"],
    ]);
  });

  it("sends a nudge at a time fall-back repeats once, at its first", async () => {
    const user = await setUp(NEW_YORK, at("2027-11-06 12:00"));
    await nudgeAt(user.id, "01:30");

    await sweepEvery15(at("2027-11-07 00:00"), at("2027-11-08 00:00"));

    expect(sentTimes()).toEqual([iso("2027-11-07T05:30:00Z")]); // 01:30 EDT
    expect((await rowsOf(user.id)).at(-1)).toMatchObject({
      status: "scheduled",
      targetAt: iso("2027-11-08T06:30:00Z"), // 01:30 EST
    });
  });
});

// --- Quiet hours on a DST night ---------------------------------------------------

describe("quiet hours on a DST night", () => {
  const at = (when: string) => local(NEW_YORK, when);

  it("ends overnight quiet hours at 07:00 local on the spring-forward and fall-back mornings", async () => {
    const user = await setUp(NEW_YORK, at("2027-03-13 12:00"), {
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    });
    const spring = await timedTask(user.id, NEW_YORK, "2027-03-14 07:30", {
      reminderOffsetMinutes: 60,
    });
    const fall = await timedTask(user.id, NEW_YORK, "2027-11-07 07:30", {
      reminderOffsetMinutes: 60,
    });

    await sweepEvery15(at("2027-03-14 06:00"), at("2027-03-14 06:30"));
    expect(await rowFor(user.id, spring.id)).toMatchObject({
      status: "scheduled",
      heldUntil: iso("2027-03-14T11:00:00Z"), // 07:00 EDT
    });
    await sweepEvery15(at("2027-03-14 06:45"), at("2027-03-14 07:15"));

    await sweepEvery15(at("2027-11-07 06:00"), at("2027-11-07 06:30"));
    expect(await rowFor(user.id, fall.id)).toMatchObject({
      status: "scheduled",
      heldUntil: iso("2027-11-07T12:00:00Z"), // 07:00 EST
    });
    await sweepEvery15(at("2027-11-07 06:45"), at("2027-11-07 07:15"));

    expect(sent.map(({ at: when, payload }) => [when, payload.title])).toEqual([
      [iso("2027-03-14T11:00:00Z"), "Due 07:30 · Submit visa form"],
      [iso("2027-11-07T12:00:00Z"), "Due 07:30 · Submit visa form"],
    ]);
  });

  it("ends quiet hours whose end spring-forward skips when the clock jumps past it", async () => {
    // Quiet 01:00–02:30: on 14 March the clock goes from 01:59 EST to
    // 03:00 EDT, so they end at 03:00 EDT (07:00 UTC), not at 03:30.
    const user = await setUp(NEW_YORK, at("2027-03-13 12:00"), {
      quietHoursStart: "01:00",
      quietHoursEnd: "02:30",
    });
    // Due 03:10 EDT (07:10 UTC), fires 06:40 UTC (01:40 EST, quiet).
    const task = await timedTask(user.id, NEW_YORK, "2027-03-14 03:10", {
      reminderOffsetMinutes: 30,
    });

    await sweepAt(iso("2027-03-14T06:30:00Z"));
    expect((await rowFor(user.id, task.id)).heldUntil).toEqual(
      iso("2027-03-14T07:00:00Z"),
    );
    await sweepEvery15(
      iso("2027-03-14T06:45:00Z"),
      iso("2027-03-14T07:30:00Z"),
    );

    expect(sent.map(({ at: when, payload }) => [when, payload.title])).toEqual([
      [iso("2027-03-14T07:00:00Z"), "Due 03:10 · Submit visa form"],
    ]);
  });

  it("treats quiet hours ending in the repeated fall-back hour as over at the first end", async () => {
    // Quiet 00:00–01:30 on 7 November end at the first 01:30 (EDT, 05:30
    // UTC). When the clock repeats 01:00–01:59 in EST they're over.
    const user = await setUp(NEW_YORK, at("2027-11-06 12:00"), {
      quietHoursStart: "00:00",
      quietHoursEnd: "01:30",
    });
    // Comes due at the first sweep, at 01:00 EDT: held.
    const early = await timedTask(user.id, NEW_YORK, "2027-11-07 03:00", {
      title: "Early",
      reminderOffsetMinutes: 1440,
    });
    // Due 02:20 EST (07:20 UTC), fires 06:20 UTC: 01:20 EST, the repeat.
    const late = await timedTask(user.id, NEW_YORK, "2027-11-07 02:20", {
      title: "Late",
      reminderOffsetMinutes: 60,
    });

    await sweepAt(iso("2027-11-07T05:00:00Z"));
    expect((await rowFor(user.id, early.id)).heldUntil).toEqual(
      iso("2027-11-07T05:30:00Z"),
    );
    await sweepEvery15(
      iso("2027-11-07T05:15:00Z"),
      iso("2027-11-07T06:30:00Z"),
    );

    expect(sent.map(({ at: when, payload }) => [when, payload.title])).toEqual([
      [iso("2027-11-07T05:30:00Z"), "Due 03:00 · Early"],
      [iso("2027-11-07T06:15:00Z"), "Due 02:20 · Late"],
    ]);
    expect((await rowFor(user.id, late.id)).heldUntil).toBeNull();
  });
});

// --- A user changing time zone ------------------------------------------------------

describe("a user changing time zone", () => {
  const TOKYO = "Asia/Tokyo";
  const moveTo = (userId: string, timezone: string) =>
    savePreferences(userId, { timezone, locale: "en-GB", weekStart: 1 });

  it("keeps item reminders on their instants, formats them in the new zone, and releases a hold from the old zone's quiet hours", async () => {
    // 23:00 in New York on Monday 11 January is 13:00 Tuesday in Tokyo.
    const now = local(NEW_YORK, "2027-01-11 23:00");
    const user = await setUp(NEW_YORK, now, {
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    });
    // Due 23:40 in New York (04:40 UTC), fires 23:10.
    const task = await timedTask(user.id, NEW_YORK, "2027-01-11 23:40", {
      reminderOffsetMinutes: 30,
    });

    // Quiet in New York: held until 07:00 there.
    await sweepAt(now);
    expect((await rowFor(user.id, task.id)).heldUntil).toEqual(
      local(NEW_YORK, "2027-01-12 07:00"),
    );

    // The user moves to Tokyo, where it's the afternoon.
    vi.setSystemTime(plusMinutes(now, 5));
    await moveTo(user.id, TOKYO);
    expect(await rowFor(user.id, task.id)).toMatchObject({
      status: "scheduled",
      targetAt: iso("2027-01-12T04:40:00Z"),
      fireAt: iso("2027-01-12T04:10:00Z"),
      // New York's quiet hours no longer apply.
      heldUntil: null,
    });

    await sweepAt(plusMinutes(now, 15));
    expect(sentTitles()).toEqual(["Due 13:40 · Submit visa form"]);
    expect((await rowFor(user.id, task.id)).status).toBe("sent");
  });

  it("holds by the new zone's quiet hours after a move", async () => {
    // 16:50 in New York is 06:50 in Tokyo, inside 22:00–07:00 there.
    const now = local(NEW_YORK, "2027-01-11 10:00");
    const user = await setUp(NEW_YORK, now, {
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    });
    const task = await timedTask(user.id, NEW_YORK, "2027-01-11 18:00", {
      reminderOffsetMinutes: 60,
    });
    await moveTo(user.id, TOKYO);

    await sweepAt(local(NEW_YORK, "2027-01-11 16:50"));

    expect(sent).toEqual([]);
    expect(await rowFor(user.id, task.id)).toMatchObject({
      status: "scheduled",
      heldUntil: local(TOKYO, "2027-01-12 07:00"),
    });
  });

  it("moves the nudge to the new zone's morning and sends it there", async () => {
    const now = local(NEW_YORK, "2027-01-11 10:00");
    const user = await setUp(NEW_YORK, now);
    await nudgeAt(user.id, "08:00");
    expect((await rowsOf(user.id))[0]!.targetAt).toEqual(
      local(NEW_YORK, "2027-01-12 08:00"),
    );

    await moveTo(user.id, TOKYO);
    // 08:00 Tuesday in Tokyo is 18:00 Monday in New York.
    const tokyoMorning = local(TOKYO, "2027-01-12 08:00");
    expect(await rowsOf(user.id)).toMatchObject([
      { kind: "daily_nudge", status: "scheduled", targetAt: tokyoMorning },
    ]);

    await sweepAt(plusMinutes(tokyoMorning, -10));
    expect(sentTitles()).toEqual(["Time to plan your day"]);
  });
});

// --- The server in UTC, the user in a far zone -------------------------------------

describe("the server in UTC with a user in a far zone", () => {
  const serverZone = process.env.TZ;
  beforeAll(() => {
    // Node applies a changed TZ at once. Nothing in the sweep may depend
    // on the process zone; this pins it to what Render runs.
    process.env.TZ = "UTC";
  });
  afterAll(() => {
    if (serverZone === undefined) delete process.env.TZ;
    else process.env.TZ = serverZone;
  });

  it("runs with the process clock in UTC", () => {
    expect(new Date(2027, 0, 11).toISOString()).toBe(
      "2027-01-11T00:00:00.000Z",
    );
  });

  // 15:00 UTC on Monday 11 January is 05:00 Tuesday in Kiritimati and
  // 04:00 Monday in Pago Pago: 25 hours apart, on two local dates.
  const now = iso("2027-01-11T15:00:00Z");

  it.each([
    {
      zone: KIRITIMATI,
      nudge: "07:30",
      first: iso("2027-01-11T17:30:00Z"), // Tue 07:30 local
      next: iso("2027-01-12T17:30:00Z"),
    },
    {
      zone: PAGO_PAGO,
      nudge: "21:00",
      first: iso("2027-01-12T08:00:00Z"), // Mon 21:00 local
      next: iso("2027-01-13T08:00:00Z"),
    },
  ])(
    "schedules and sends the nudge by the local day in $zone",
    async ({ zone, nudge, first, next }) => {
      const user = await setUp(zone, now);
      await nudgeAt(user.id, nudge);
      expect(await rowsOf(user.id)).toMatchObject([{ targetAt: first }]);

      await sweepAt(plusMinutes(first, -10));

      expect(sentTitles()).toEqual(["Time to plan your day"]);
      expect(await rowsOf(user.id)).toMatchObject([
        { targetAt: first, status: "sent" },
        { targetAt: next, status: "scheduled" },
      ]);
    },
  );

  it.each([
    // A nudge at 23:50 local whose sweeps were missed: still sent at
    // 23:55, stale from local midnight.
    { zone: KIRITIMATI, target: iso("2027-01-12T09:50:00Z"), late: 5 },
    { zone: KIRITIMATI, target: iso("2027-01-12T09:50:00Z"), late: 10 },
    { zone: PAGO_PAGO, target: iso("2027-01-12T10:50:00Z"), late: 5 },
    { zone: PAGO_PAGO, target: iso("2027-01-12T10:50:00Z"), late: 10 },
  ])(
    "ends a missed nudge's day at local midnight in $zone ($late min late)",
    async ({ zone, target, late }) => {
      const user = await setUp(zone, now);
      await nudgeAt(user.id, "23:50");
      expect((await rowsOf(user.id))[0]!.targetAt).toEqual(target);

      await sweepAt(plusMinutes(target, late));

      expect((await rowsOf(user.id))[0]).toMatchObject(
        late < 10
          ? { status: "sent" }
          : { status: "skipped", skipReason: "stale" },
      );
    },
  );

  it.each([
    // 23:00 local in both: held until 07:00 the next local morning.
    {
      zone: KIRITIMATI,
      sweep: iso("2027-01-11T09:00:00Z"),
      end: iso("2027-01-11T17:00:00Z"),
    },
    {
      zone: PAGO_PAGO,
      sweep: iso("2027-01-12T10:00:00Z"),
      end: iso("2027-01-12T18:00:00Z"),
    },
  ])(
    "holds quiet hours by the local clock in $zone",
    async ({ zone, sweep, end }) => {
      const user = await setUp(zone, plusMinutes(sweep, -60), {
        quietHoursStart: "22:00",
        quietHoursEnd: "07:00",
      });
      // Due two hours after quiet hours end; a day-before reminder is due.
      const task = await timedTask(
        user.id,
        zone,
        wallClock(plusMinutes(end, 120), zone),
        { reminderOffsetMinutes: 1440 },
      );

      await sweepAt(sweep);

      expect(sent).toEqual([]);
      expect(await rowFor(user.id, task.id)).toMatchObject({
        status: "scheduled",
        heldUntil: end,
      });
    },
  );

  it("labels a reminder 'tomorrow' by the user's local day, not the server's", async () => {
    // 09:50 UTC on Sunday 10 January is 23:50 Sunday in Kiritimati and
    // 22:50 Saturday in Pago Pago. Each user's deadline is just after their
    // local midnight, but on the same UTC day as the sweep.
    const sweep = iso("2027-01-10T09:50:00Z");
    const kiritimati = await setUp(KIRITIMATI, plusMinutes(sweep, -60));
    await timedTask(kiritimati.id, KIRITIMATI, "2027-01-11 00:05", {
      reminderOffsetMinutes: 30,
    });
    const pagoPago = await setUp(PAGO_PAGO, plusMinutes(sweep, -60));
    await timedTask(pagoPago.id, PAGO_PAGO, "2027-01-10 00:00", {
      title: "Pay rent",
      reminderOffsetMinutes: 60,
    });

    await sweepAt(sweep);

    expect(sentTitles().sort()).toEqual([
      "Due tomorrow 00:00 · Pay rent",
      "Due tomorrow 00:05 · Submit visa form",
    ]);
  });
});

// --- Missed sweeps -------------------------------------------------------------------

describe("missed sweeps", () => {
  const at = (when: string) => local(NEW_YORK, when);

  it("catches up after a day and a half without sweeps: sends what is still useful once and skips the rest as stale", async () => {
    const user = await setUp(NEW_YORK, at("2027-01-11 10:00"));
    const passed = await timedTask(user.id, NEW_YORK, "2027-01-11 11:00", {
      reminderOffsetMinutes: 60,
    });
    const ahead = await timedTask(user.id, NEW_YORK, "2027-01-13 09:30", {
      title: "Call the bank",
      reminderOffsetMinutes: 1440,
    });
    const series = await dailyEvent(user.id, NEW_YORK, "2027-01-04 09:00");
    await nudgeAt(user.id, "18:00");

    // The cron job stopped at 10:00 on Monday and resumes at 08:45 on
    // Wednesday: the deadline, Tuesday's standup and Monday's nudge passed.
    const resumed = await sweepAt(at("2027-01-13 08:45"));

    expect(resumed.counts).toMatchObject({
      claimed: 5,
      sent: 2,
      skipped: 3,
      skippedByReason: { stale: 3, disabled: 0, no_device: 0 },
      failed: 0,
    });
    expect(await rowFor(user.id, passed.id)).toMatchObject({
      status: "skipped",
      skipReason: "stale",
    });
    expect(await rowFor(user.id, ahead.id)).toMatchObject({ status: "sent" });
    // The standup rolled straight to Wednesday's occurrence, which the same
    // sweep sends (its reminder is due before the next sweep), rather than
    // one row per missed day.
    const standups = (await rowsOf(user.id)).filter(
      (row) => row.eventId === series.id,
    );
    expect(standups).toMatchObject([
      { occurrenceStart: at("2027-01-12 09:00"), status: "skipped" },
      { occurrenceStart: at("2027-01-13 09:00"), status: "sent" },
      { occurrenceStart: at("2027-01-14 09:00"), status: "scheduled" },
    ]);
    expect(sentTitles().sort()).toEqual([
      "Due 09:30 · Call the bank",
      "Standup · 09:00 (in 15 min)",
    ]);
    // The nudge skipped Monday's and waits for Wednesday's.
    const nudges = (await rowsOf(user.id)).filter(
      (row) => row.kind === "daily_nudge",
    );
    expect(nudges).toMatchObject([
      { targetAt: at("2027-01-11 18:00"), status: "skipped" },
      { targetAt: at("2027-01-13 18:00"), status: "scheduled" },
    ]);

    // Sweeping on from there sends nothing twice.
    await sweepEvery15(at("2027-01-13 09:00"), at("2027-01-13 10:00"));
    expect(sent).toHaveLength(2);
  });

  it("sends a nudge rolled past a missed day by the sweep that rolled it, not late", async () => {
    const user = await setUp(NEW_YORK, at("2027-01-11 06:00"));
    await nudgeAt(user.id, "08:40");

    // No sweeps from Monday 06:00 until 08:30 on Tuesday.
    await sweepAt(at("2027-01-12 08:30"));

    expect(sentTimes()).toEqual([at("2027-01-12 08:30")]);
  });

  it("doesn't retry a failed send within the same sweep", async () => {
    const user = await setUp(NEW_YORK, at("2027-01-11 10:00"));
    const task = await timedTask(user.id, NEW_YORK, "2027-01-11 10:10");
    sendNotification.mockRejectedValue(
      new webpush.WebPushError("refused", 503, {}, "", "endpoint"),
    );

    const sweep = await sweepAt(at("2027-01-11 10:00"));

    expect(sweep.counts).toMatchObject({ claimed: 1, retrying: 1 });
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(await rowFor(user.id, task.id)).toMatchObject({
      status: "scheduled",
      attempts: 1,
    });
  });
});

// --- A sweep cut off part way ----------------------------------------------------------

describe("a sweep cut off between sending and recording", () => {
  const now = local(NEW_YORK, "2027-01-11 10:00");

  it("resends what wasn't recorded once the claim is 10 minutes old, under the same tag, and nothing it recorded", async () => {
    const user = await setUp(NEW_YORK, now);
    const tasks: { id: string }[] = [];
    for (const due of ["10:50", "10:55", "11:00"]) {
      tasks.push(
        await timedTask(user.id, NEW_YORK, `2027-01-11 ${due}`, {
          title: `Task ${due}`,
          reminderOffsetMinutes: 60,
        }),
      );
    }
    // The request dies after the first reminder is recorded and the
    // second is sent: the second and third stay `sending`.
    cutOff.after = 1;

    await sweepAt(now);
    expect(sentTitles()).toEqual([
      "Due 10:50 · Task 10:50",
      "Due 10:55 · Task 10:55",
    ]);
    const statuses = async () =>
      Promise.all(
        tasks.map(async (task) => (await rowFor(user.id, task.id)).status),
      );
    expect(await statuses()).toEqual(["sent", "sending", "sending"]);

    cutOff.after = Infinity;
    // A sweep 5 minutes later leaves rows another sweep may still hold.
    await sweepAt(plusMinutes(now, 5));
    expect(sent).toHaveLength(2);

    const reclaimed = await sweepAt(plusMinutes(now, 10));
    expect(reclaimed.counts).toMatchObject({ claimed: 2, sent: 2 });
    expect(sentTitles()).toEqual([
      "Due 10:50 · Task 10:50",
      "Due 10:55 · Task 10:55",
      "Due 10:55 · Task 10:55",
      "Due 11:00 · Task 11:00",
    ]);
    // The duplicate carries the first one's tag, so the browser replaces
    // that notification rather than showing a second.
    expect(sent[2]!.payload.tag).toBe(sent[1]!.payload.tag);
    expect(await statuses()).toEqual(["sent", "sent", "sent"]);
  });

  it("skips a cut-off reminder as stale if its target passes before the reclaim", async () => {
    const user = await setUp(NEW_YORK, now);
    const task = await timedTask(user.id, NEW_YORK, "2027-01-11 10:05");
    cutOff.after = 0;

    await sweepAt(now);
    expect(sent).toHaveLength(1);
    cutOff.after = Infinity;

    await sweepAt(plusMinutes(now, 10));
    expect(sent).toHaveLength(1);
    expect(await rowFor(user.id, task.id)).toMatchObject({
      status: "skipped",
      skipReason: "stale",
    });
  });
});

// --- Visibility ------------------------------------------------------------------------

describe("what a sweep leaves to see", () => {
  const now = local(NEW_YORK, "2027-01-11 10:00");

  it("logs its counts with skips by reason, and its duration, without content", async () => {
    const user = await setUp(NEW_YORK, now);
    await timedTask(user.id, NEW_YORK, "2027-01-11 10:05");
    const passed = await timedTask(user.id, NEW_YORK, "2027-01-11 10:20", {
      title: "Secret plans",
    });
    await db
      .update(userPreferences)
      .set({ remindersEnabled: false })
      .where(eq(userPreferences.userId, user.id));
    const logs = captureLogs();

    const sweep = await sweepAt(plusMinutes(now, 10));

    expect(sweep.counts).toMatchObject({
      claimed: 2,
      skipped: 2,
      skippedByReason: { stale: 1, disabled: 1, no_device: 0 },
    });
    expect(logs.entries()).toEqual([
      expect.objectContaining({
        msg: "Reminder sweep finished",
        counts: sweep.counts,
        durationMs: sweep.durationMs,
      }),
    ]);
    expect(logs.text()).not.toContain("Secret plans");
    expect(logs.text()).not.toContain(passed.id);
  });

  it("records when the last sweep finished, never moving it back", async () => {
    expect(await lastSweepAt()).toBeNull();
    expect(await sweepHealth(now)).toEqual({
      overdue: true,
      lastSweepAt: null,
    });

    await sweepAt(now);
    expect(await lastSweepAt()).toEqual(now);
    // An overlapping sweep that started earlier finishes last.
    await sweepAt(plusMinutes(now, -15));
    expect(await lastSweepAt()).toEqual(now);

    expect(await sweepHealth(plusMinutes(now, 60))).toEqual({
      overdue: false,
      lastSweepAt: now,
    });
    expect((await sweepHealth(plusMinutes(now, 61))).overdue).toBe(true);
  });
});
