import { createECDH, randomBytes, randomUUID } from "node:crypto";

import { asc, eq } from "drizzle-orm";
import webpush from "web-push";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { claimDueReminders } from "./claim";
import { runSweep } from "./sweep";

// Delivery in the sweep (chunk 5.5, ADR 0013). Push is mocked at the
// library boundary: `web-push`'s sendNotification.
const sendNotification = vi.hoisted(() => vi.fn());
vi.mock("web-push", async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof webpush }>();
  return { default: { ...actual.default, sendNotification } };
});

const NEW_YORK = "America/New_York";

/** Monday 11 January 2027, 10:00 in New York (15:00 UTC). */
const NOW = new Date("2027-01-11T15:00:00.000Z");

/** The UTC instant of a New York wall-clock time, e.g. "2027-01-12 09:00". */
const at = (local: string) => {
  const [date, time] = local.split(" ");
  return instantFromLocal(date!, time!, NEW_YORK);
};
const plusMinutes = (instant: Date, minutes: number) =>
  new Date(instant.getTime() + minutes * 60_000);

type Form = Record<string, unknown>;
let logs: ReturnType<typeof captureLogs>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  sendNotification.mockReset();
  sendNotification.mockResolvedValue({ statusCode: 201 });
  logs = captureLogs();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// --- Fixtures ------------------------------------------------------------------

type ReminderPreferences = Partial<
  Pick<
    typeof userPreferences.$inferInsert,
    | "remindersEnabled"
    | "remindersPrivate"
    | "quietHoursStart"
    | "quietHoursEnd"
  >
>;

/** A user in New York (en-GB times, "14:00") with `devices` subscribed. */
async function setUp({
  devices = 1,
  ...preferences
}: { devices?: number } & ReminderPreferences = {}) {
  const user = await createTestUser();
  await savePreferences(user.id, {
    timezone: NEW_YORK,
    locale: "en-GB",
    weekStart: 1,
  });
  if (Object.keys(preferences).length > 0) {
    await db
      .update(userPreferences)
      .set(preferences)
      .where(eq(userPreferences.userId, user.id));
  }
  const subscriptions = [];
  for (let i = 0; i < devices; i++)
    subscriptions.push(await subscribe(user.id));
  return { user, subscriptions };
}

async function subscribe(userId: string) {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
      userAgentLabel: "Chrome on Linux",
    })
    .returning();
  return row!;
}

const timedTask = (userId: string, due: string, fields: Form = {}) => {
  const [dueDate, dueTime] = due.split(" ");
  return createTask(
    userId,
    createTaskSchema.parse({
      title: "Submit visa form",
      dueDate,
      dueTime,
      dueTz: NEW_YORK,
      reminderOffsetMinutes: 0,
      ...fields,
    }),
  );
};

const timedEvent = (
  userId: string,
  start: string,
  end: string,
  fields: Form = {},
) => {
  const [startDate, startTime] = start.split(" ");
  const [endDate, endTime] = end.split(" ");
  return createCalendarEvent(
    userId,
    createCalendarEventSchema.parse({
      title: "Dentist",
      allDay: false,
      startDate,
      startTime,
      endDate,
      endTime,
      tz: NEW_YORK,
      reminderOffsetMinutes: 10,
      ...fields,
    }),
  );
};

const nudgeAt = (userId: string, dailyNudgeTime: string) =>
  setDailyNudgeTime(userId, setDailyNudgeTimeSchema.parse({ dailyNudgeTime }));

/** Runs a sweep at a New York time (or an instant), with the clock there. */
async function sweepAt(when: string | Date) {
  const now = typeof when === "string" ? at(when) : when;
  vi.setSystemTime(now);
  return runSweep(now);
}

const rowsOf = (userId: string) =>
  db
    .select()
    .from(reminders)
    .where(eq(reminders.userId, userId))
    .orderBy(asc(reminders.targetAt), asc(reminders.createdAt));

const rowById = async (id: string) => {
  const [row] = await db.select().from(reminders).where(eq(reminders.id, id));
  return row!;
};

/** The one reminder row an item has, by task or event ID. */
const rowFor = async (userId: string, itemId: string) => {
  const rows = (await rowsOf(userId)).filter(
    (row) => row.taskId === itemId || row.eventId === itemId,
  );
  expect(rows).toHaveLength(1);
  return rows[0]!;
};

/** Each push sent: the payload as the browser gets it, and the options. */
const pushes = () =>
  sendNotification.mock.calls.map(([subscription, body, options]) => ({
    endpoint: (subscription as { endpoint: string }).endpoint,
    body: body as string,
    payload: JSON.parse(body as string) as Record<string, string>,
    options: options as { TTL: number },
  }));

const subscriptionsOf = (userId: string) =>
  db
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId));

const refusedWith = (status: number) =>
  new webpush.WebPushError("refused", status, {}, "", "endpoint");

// --- Sending -------------------------------------------------------------------

describe("sending", () => {
  it("sends a due reminder to every device, records it sent, and holds the push until the target", async () => {
    const { user, subscriptions } = await setUp({ devices: 2 });
    const task = await timedTask(user.id, "2027-01-11 10:40", {
      reminderOffsetMinutes: 30,
    });

    const sweep = await sweepAt(NOW);

    expect(sweep.counts).toMatchObject({ claimed: 1, sent: 1 });
    const sent = pushes();
    expect(sent.map(({ endpoint }) => endpoint).sort()).toEqual(
      subscriptions.map(({ endpoint }) => endpoint).sort(),
    );
    expect(sent[0]!.payload).toEqual({
      title: "Due 10:40 · Submit visa form",
      url: `/plan/calendar?view=day&item=task%3A${task.id}%3Adue`,
      tag: expect.stringMatching(/^reminder-/),
    });
    // TTL: until the deadline, 40 minutes away.
    expect(sent[0]!.options.TTL).toBe(40 * 60);

    expect(await rowFor(user.id, task.id)).toMatchObject({
      status: "sent",
      sentAt: NOW,
      attempts: 1,
      lastErrorCode: null,
    });
    for (const device of await subscriptionsOf(user.id)) {
      expect(device.lastSuccessAt).toEqual(NOW);
    }
  });

  it("keeps the never-late window: due 14 minutes after the sweep is sent, 16 minutes after waits", async () => {
    const { user } = await setUp();
    const inFourteen = await timedTask(user.id, "2027-01-11 10:14");
    const inSixteen = await timedTask(user.id, "2027-01-11 10:16");

    await sweepAt(NOW);
    expect(pushes()).toHaveLength(1);
    expect((await rowFor(user.id, inFourteen.id)).status).toBe("sent");
    expect((await rowFor(user.id, inSixteen.id)).status).toBe("scheduled");

    // The next sweep, before 10:16, sends it.
    await sweepAt("2027-01-11 10:15");
    expect(pushes()).toHaveLength(2);
    expect((await rowFor(user.id, inSixteen.id)).status).toBe("sent");
  });

  it("sends once across overlapping and repeated sweeps", async () => {
    const { user } = await setUp();
    for (let minute = 1; minute <= 6; minute++) {
      await timedTask(user.id, `2027-01-11 10:0${minute}`);
    }

    const overlapping = await Promise.all([sweepAt(NOW), sweepAt(NOW)]);
    const again = await sweepAt(NOW);

    expect(overlapping.reduce((sum, { counts }) => sum + counts.sent, 0)).toBe(
      6,
    );
    expect(again.counts).toMatchObject({ claimed: 0, sent: 0 });
    const tags = pushes().map(({ payload }) => payload.tag);
    expect(tags).toHaveLength(6);
    expect(new Set(tags).size).toBe(6);
  });

  it("claims a row a cut-off sweep left sending once 10 minutes have passed", async () => {
    const { user } = await setUp();
    const task = await timedTask(user.id, "2027-01-11 11:00", {
      reminderOffsetMinutes: 60,
    });
    // A sweep claims it, then is cut off before sending.
    await claimDueReminders(NOW);

    await sweepAt(plusMinutes(NOW, 9));
    expect(pushes()).toHaveLength(0);
    expect((await rowFor(user.id, task.id)).status).toBe("sending");

    await sweepAt(plusMinutes(NOW, 10));
    expect(pushes()).toHaveLength(1);
    expect((await rowFor(user.id, task.id)).status).toBe("sent");
  });

  it("removes a subscription the push service says is gone, and still sends to the rest", async () => {
    const { user, subscriptions } = await setUp({ devices: 2 });
    const [gone, kept] = subscriptions;
    sendNotification.mockImplementation(async ({ endpoint }) => {
      if (endpoint === gone!.endpoint) throw refusedWith(410);
      return { statusCode: 201 };
    });
    const task = await timedTask(user.id, "2027-01-11 10:05");

    await sweepAt(NOW);

    expect((await subscriptionsOf(user.id)).map(({ id }) => id)).toEqual([
      kept!.id,
    ]);
    expect((await rowFor(user.id, task.id)).status).toBe("sent");
  });

  it("skips as no device when the only subscription has expired", async () => {
    const { user } = await setUp();
    sendNotification.mockRejectedValue(refusedWith(404));
    const first = await timedTask(user.id, "2027-01-11 10:05");
    const second = await timedTask(user.id, "2027-01-11 10:06");

    await sweepAt(NOW);

    expect(await subscriptionsOf(user.id)).toEqual([]);
    // Only the first was tried: the device was gone for the second.
    expect(pushes()).toHaveLength(1);
    for (const task of [first, second]) {
      expect(await rowFor(user.id, task.id)).toMatchObject({
        status: "skipped",
        skipReason: "no_device",
      });
    }
  });

  it("retries on later sweeps, then marks the reminder failed with the error code after 3 attempts", async () => {
    const { user, subscriptions } = await setUp();
    sendNotification.mockRejectedValue(refusedWith(500));
    const task = await timedTask(user.id, "2027-01-11 12:00", {
      reminderOffsetMinutes: 60,
    });

    const first = await sweepAt("2027-01-11 10:50");
    expect(first.counts).toMatchObject({ claimed: 1, retrying: 1 });
    expect(await rowFor(user.id, task.id)).toMatchObject({
      status: "scheduled",
      attempts: 1,
      lastErrorCode: "http_500",
      claimedAt: null,
    });

    await sweepAt("2027-01-11 11:05");
    expect(await rowFor(user.id, task.id)).toMatchObject({
      status: "scheduled",
      attempts: 2,
    });

    const third = await sweepAt("2027-01-11 11:20");
    expect(third.counts).toMatchObject({ failed: 1 });
    expect(await rowFor(user.id, task.id)).toMatchObject({
      status: "failed",
      attempts: 3,
      lastErrorCode: "http_500",
    });
    expect(pushes()).toHaveLength(3);
    // The subscription stays; its failures are counted.
    const [device] = await subscriptionsOf(user.id);
    expect(device).toMatchObject({ id: subscriptions[0]!.id, failedCount: 3 });

    // Nothing more is tried.
    await sweepAt("2027-01-11 11:35");
    expect(pushes()).toHaveLength(3);
  });

  it("logs counts only: no titles, payloads or endpoints", async () => {
    const { user, subscriptions } = await setUp();
    await timedTask(user.id, "2027-01-11 10:05", { title: "Secret errand" });

    await sweepAt(NOW);

    const text = logs.text();
    expect(text).toContain("Reminder sweep finished");
    expect(text).not.toContain("Secret errand");
    expect(text).not.toContain(subscriptions[0]!.endpoint);
    expect(text).not.toContain(subscriptions[0]!.auth);
  });
});

// --- Skips ---------------------------------------------------------------------

describe("skip reasons", () => {
  it("skips a reminder as stale once its deadline or event start has passed (a missed sweep)", async () => {
    const { user } = await setUp();
    const task = await timedTask(user.id, "2027-01-11 10:10");
    const event = await timedEvent(
      user.id,
      "2027-01-11 10:20",
      "2027-01-11 10:50",
    );

    // The sweeps until 10:25 were missed.
    const sweep = await sweepAt("2027-01-11 10:25");

    expect(sweep.counts).toMatchObject({ claimed: 2, skipped: 2, sent: 0 });
    expect(pushes()).toEqual([]);
    for (const id of [task.id, event.id]) {
      expect(await rowFor(user.id, id)).toMatchObject({
        status: "skipped",
        skipReason: "stale",
        attempts: 0,
      });
    }
  });

  it("skips the nudge as stale once its local day is over", async () => {
    const { user } = await setUp();
    await nudgeAt(user.id, "18:00");

    await sweepAt("2027-01-12 00:10");

    const [missed, next] = await rowsOf(user.id);
    expect(missed).toMatchObject({
      kind: "daily_nudge",
      targetAt: at("2027-01-11 18:00"),
      status: "skipped",
      skipReason: "stale",
    });
    // Tomorrow's is scheduled in the same transaction.
    expect(next).toMatchObject({
      targetAt: at("2027-01-12 18:00"),
      status: "scheduled",
    });
  });

  it("skips as disabled while reminders are off, after the stale check", async () => {
    const { user } = await setUp({ remindersEnabled: false });
    const due = await timedTask(user.id, "2027-01-11 10:15");
    const passed = await timedTask(user.id, "2027-01-11 10:03");

    await sweepAt("2027-01-11 10:05");

    expect(pushes()).toEqual([]);
    expect(await rowFor(user.id, due.id)).toMatchObject({
      status: "skipped",
      skipReason: "disabled",
    });
    expect(await rowFor(user.id, passed.id)).toMatchObject({
      status: "skipped",
      skipReason: "stale",
    });
  });

  it("skips as no device when nothing is subscribed, without touching other users", async () => {
    const { user: deviceless } = await setUp({ devices: 0 });
    const { user: subscribed } = await setUp();
    const skipped = await timedTask(deviceless.id, "2027-01-11 10:05");
    const sent = await timedTask(subscribed.id, "2027-01-11 10:05");

    await sweepAt(NOW);

    expect(await rowFor(deviceless.id, skipped.id)).toMatchObject({
      status: "skipped",
      skipReason: "no_device",
    });
    expect((await rowFor(subscribed.id, sent.id)).status).toBe("sent");
    expect(pushes()).toHaveLength(1);
  });
});

// --- Quiet hours -----------------------------------------------------------------

describe("quiet hours", () => {
  const overnight = { quietHoursStart: "22:00", quietHoursEnd: "07:00" };

  it("holds reminders until the end, then sends the ones still useful as one bundle", async () => {
    const { user } = await setUp(overnight);
    const first = await timedTask(user.id, "2027-01-12 07:30", {
      reminderOffsetMinutes: 60,
    });
    const second = await timedTask(user.id, "2027-01-12 07:45", {
      reminderOffsetMinutes: 60,
    });
    // Starts before quiet hours end, so it goes stale while held.
    const early = await timedEvent(
      user.id,
      "2027-01-12 06:40",
      "2027-01-12 07:10",
    );

    const holding = await sweepAt("2027-01-12 06:20");
    expect(holding.counts).toMatchObject({ claimed: 2, held: 2 });
    await sweepAt("2027-01-12 06:35");
    // Held rows aren't claimed again before the end.
    const waiting = await sweepAt("2027-01-12 06:50");
    expect(waiting.counts.claimed).toBe(0);
    expect(pushes()).toEqual([]);
    for (const task of [first, second]) {
      expect(await rowFor(user.id, task.id)).toMatchObject({
        status: "scheduled",
        claimedAt: null,
        heldUntil: at("2027-01-12 07:00"),
      });
    }

    const release = await sweepAt("2027-01-12 07:05");

    expect(release.counts).toMatchObject({ claimed: 3, sent: 2, skipped: 1 });
    expect(pushes()).toHaveLength(1);
    expect(pushes()[0]!.payload).toEqual({
      title: "2 reminders from quiet hours",
      url: "/plan/today",
      tag: "reminders-quiet-hours",
    });
    expect(pushes()[0]!.body).not.toContain("Submit visa form");
    for (const task of [first, second]) {
      expect((await rowFor(user.id, task.id)).status).toBe("sent");
    }
    expect(await rowFor(user.id, early.id)).toMatchObject({
      status: "skipped",
      skipReason: "stale",
    });
  });

  it("sends a single held reminder on its own, with its title", async () => {
    const { user } = await setUp(overnight);
    const task = await timedTask(user.id, "2027-01-12 07:03");

    await sweepAt("2027-01-12 06:50");
    expect(pushes()).toEqual([]);
    // The first sweep at the end, before the deadline.
    await sweepAt("2027-01-12 07:00");

    expect(pushes().map(({ payload }) => payload.title)).toEqual([
      "Due 07:03 · Submit visa form",
    ]);
    expect((await rowFor(user.id, task.id)).status).toBe("sent");
  });

  it("holds across midnight until the next morning's end", async () => {
    const { user } = await setUp(overnight);
    const task = await timedTask(user.id, "2027-01-12 23:50", {
      reminderOffsetMinutes: 1440,
    });

    await sweepAt("2027-01-11 23:40");

    expect(pushes()).toEqual([]);
    expect(await rowFor(user.id, task.id)).toMatchObject({
      status: "scheduled",
      heldUntil: at("2027-01-12 07:00"),
    });

    await sweepAt("2027-01-12 03:00");
    expect(pushes()).toEqual([]);
    await sweepAt("2027-01-12 07:00");
    expect(pushes().map(({ payload }) => payload.title)).toEqual([
      "Due 23:50 · Submit visa form",
    ]);
  });

  it("delivers outside quiet hours as usual", async () => {
    const { user } = await setUp(overnight);
    await timedTask(user.id, "2027-01-11 10:05");

    const sweep = await sweepAt(NOW);

    expect(sweep.counts).toMatchObject({ sent: 1, held: 0 });
  });
});

// --- Content and repeating events -----------------------------------------------

describe("content", () => {
  it("names an event with its time and opens its dialog on Day", async () => {
    const { user } = await setUp();
    const event = await timedEvent(
      user.id,
      "2027-01-11 10:20",
      "2027-01-11 10:50",
    );

    await sweepAt("2027-01-11 10:05");

    expect(pushes()[0]!.payload).toMatchObject({
      title: "Dentist · 10:20 (in 15 min)",
      url: `/plan/calendar?view=day&item=event%3A${event.id}`,
    });
  });

  it("leaves the title out of the payload in private mode", async () => {
    const { user } = await setUp({ remindersPrivate: true });
    await timedEvent(user.id, "2027-01-11 10:20", "2027-01-11 10:50", {
      title: "Therapy session",
    });
    await timedTask(user.id, "2027-01-11 10:15", { title: "Pay rent" });

    await sweepAt("2027-01-11 10:05");

    const sent = pushes();
    expect(sent.map(({ payload }) => payload.title).sort()).toEqual([
      "You have a reminder · 10:15",
      "You have a reminder · 10:20",
    ]);
    for (const { body } of sent) {
      expect(body).not.toContain("Therapy");
      expect(body).not.toContain("Pay rent");
    }
  });

  it("sends the nudge as 'Time to plan your day' to Today, then schedules tomorrow's", async () => {
    const { user } = await setUp();
    await nudgeAt(user.id, "10:10");

    await sweepAt(NOW);

    expect(pushes()[0]!.payload).toMatchObject({
      title: "Time to plan your day",
      url: "/plan/today",
    });
    // TTL: until the end of the local day, not the nudge's time.
    expect(pushes()[0]!.options.TTL).toBe(14 * 60 * 60);
    expect(await rowsOf(user.id)).toMatchObject([
      { status: "sent", targetAt: at("2027-01-11 10:10") },
      { status: "scheduled", targetAt: at("2027-01-12 10:10") },
    ]);
  });
});

describe("repeating events", () => {
  const standup = (userId: string) =>
    timedEvent(userId, "2027-01-04 09:00", "2027-01-04 09:30", {
      title: "Standup",
      rrule: "FREQ=DAILY",
    });

  it("inserts the next occurrence's row after a send, linking the occurrence", async () => {
    const { user } = await setUp();
    const series = await standup(user.id);
    const next = at("2027-01-12 09:00");

    await sweepAt("2027-01-12 08:45");

    expect(pushes()[0]!.payload.title).toBe("Standup · 09:00 (in 15 min)");
    const url = new URL(pushes()[0]!.payload.url!, "https://soleup.invalid");
    expect(url.searchParams.get("item")).toBe(
      `event:${series.id}:${next.toISOString()}`,
    );
    expect(await rowsOf(user.id)).toMatchObject([
      { status: "sent", occurrenceStart: next },
      {
        status: "scheduled",
        occurrenceStart: at("2027-01-13 09:00"),
        fireAt: at("2027-01-13 08:50"),
      },
    ]);
  });

  it("inserts the next occurrence's row after a skip too", async () => {
    const { user } = await setUp({ remindersEnabled: false });
    await standup(user.id);

    await sweepAt("2027-01-12 08:45");

    expect(await rowsOf(user.id)).toMatchObject([
      { status: "skipped", skipReason: "disabled" },
      { status: "scheduled", occurrenceStart: at("2027-01-13 09:00") },
    ]);
  });

  it("rolls on after a failed reminder, so the series keeps reminding", async () => {
    const { user } = await setUp();
    const series = await standup(user.id);
    sendNotification.mockRejectedValue(refusedWith(503));
    const [row] = await rowsOf(user.id);
    await db
      .update(reminders)
      .set({ attempts: 2 })
      .where(eq(reminders.id, row!.id));

    await sweepAt("2027-01-12 08:45");

    expect(await rowById(row!.id)).toMatchObject({
      status: "failed",
      lastErrorCode: "http_503",
    });
    expect(await rowsOf(user.id)).toMatchObject([
      { eventId: series.id, status: "failed" },
      { eventId: series.id, status: "scheduled" },
    ]);
  });
});
