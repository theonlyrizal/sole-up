import { createECDH, randomBytes, randomUUID } from "node:crypto";

import { and, asc, eq } from "drizzle-orm";
import webpush from "web-push";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { instantFromLocal } from "@/lib/dates";
import { db } from "@/server/db/client";
import {
  auditEvents,
  pushSubscriptions,
  reminders,
  userPreferences,
} from "@/server/db/schema";
import { ConflictError } from "@/server/errors";
import {
  getReminderSettings,
  savePreferences,
  saveReminderSettings,
} from "@/server/modules/preferences/service";
import { saveReminderSettingsSchema } from "@/server/modules/preferences/validation";
import {
  finishWeeklyReview,
  startWeeklyReview,
} from "@/server/modules/weekly-reviews/service";

import { createTestUser } from "../../../../tests/integration/helpers/users";
import { snoozeReminder, SNOOZE_WEEKLY_REVIEW } from "./snooze";
import { runSweep } from "./sweep";

// The weekly review reminder (chunk 7.5, ADR 0015): a new reminder kind on
// the Phase 5 machinery, scheduled like the daily nudge from a local
// weekday and time, rolled to the next week once sent or skipped, and
// recomputed on a zone or setting change. Push is mocked at the library
// boundary, as in 5.5's tests.
const sendNotification = vi.hoisted(() => vi.fn());
vi.mock("web-push", async (importOriginal) => {
  const actual = await importOriginal<{ default: typeof webpush }>();
  return { default: { ...actual.default, sendNotification } };
});

const NEW_YORK = "America/New_York";
const TOKYO = "Asia/Tokyo";

/** Each push sent, in order: the payload, and when the sweep sent it. */
const sent: { at: Date; payload: Record<string, string> }[] = [];
const sentTimes = () => sent.map(({ at }) => at);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  sent.length = 0;
  sendNotification.mockReset();
  sendNotification.mockImplementation(async (_subscription, body) => {
    sent.push({ at: new Date(), payload: JSON.parse(body as string) });
    return { statusCode: 201 };
  });
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
const ny = (when: string) => local(NEW_YORK, when);
const iso = (value: string) => new Date(value);
const plusMinutes = (instant: Date, minutes: number) =>
  new Date(instant.getTime() + minutes * 60_000);

const SUNDAY = 0;
const WEDNESDAY = 3;

type Settings = Record<string, unknown>;
const SETTINGS: Settings = {
  remindersEnabled: true,
  remindersPrivate: false,
  quietHours: false,
  quietHoursStart: "",
  quietHoursEnd: "",
  dailyNudgeTime: "",
  weeklyReviewDay: null,
  weeklyReviewTime: "",
};

const saveSettings = (userId: string, fields: Settings = {}) =>
  saveReminderSettings(
    userId,
    saveReminderSettingsSchema.parse({ ...SETTINGS, ...fields }),
  );

/** The weekly review reminder on `day` at `time`, other settings as given. */
const weeklyReviewAt = (
  userId: string,
  day: number,
  time: string,
  fields: Settings = {},
) =>
  saveSettings(userId, {
    weeklyReviewDay: day,
    weeklyReviewTime: time,
    ...fields,
  });

/**
 * A user in `zone` (en-GB, week from Monday), with one subscribed device
 * unless `device` is false, set up at `now` (the clock stays there).
 */
async function setUp(
  zone: string | null,
  now: Date,
  { device = true }: { device?: boolean } = {},
) {
  vi.setSystemTime(now);
  const user = await createTestUser();
  if (zone) {
    await savePreferences(user.id, {
      timezone: zone,
      locale: "en-GB",
      weekStart: 1,
    });
  }
  if (device) {
    const ecdh = createECDH("prime256v1");
    ecdh.generateKeys();
    await db.insert(pushSubscriptions).values({
      userId: user.id,
      endpoint: `https://fcm.googleapis.com/fcm/send/${randomUUID()}`,
      p256dh: ecdh.getPublicKey().toString("base64url"),
      auth: randomBytes(16).toString("base64url"),
      userAgentLabel: "Chrome on Linux",
    });
  }
  return user;
}

/** Runs a sweep at `now`, with the clock there. */
async function sweepAt(now: Date) {
  vi.setSystemTime(now);
  return runSweep(now);
}

/** Sweeps every 15 minutes, on the UTC quarter hours from `from` to `to`. */
async function sweepEvery15(from: Date, to: Date) {
  for (let now = from; now <= to; now = plusMinutes(now, 15)) {
    await sweepAt(now);
  }
}

const rowsOf = (userId: string) =>
  db
    .select()
    .from(reminders)
    .where(eq(reminders.userId, userId))
    .orderBy(asc(reminders.targetAt), asc(reminders.createdAt));

const reviewRows = async (userId: string) =>
  (await rowsOf(userId)).filter((row) => row.kind === "weekly_review");

/** The user's one scheduled weekly review row, or undefined. */
const scheduledReview = async (userId: string) => {
  const rows = (await reviewRows(userId)).filter(
    (row) => row.status === "scheduled",
  );
  expect(rows.length).toBeLessThanOrEqual(1);
  return rows[0];
};

// --- Scheduling ------------------------------------------------------------------

describe("scheduling the weekly review reminder", () => {
  it("is off by default and schedules the next chosen weekday and time once set, audited by field", async () => {
    // Wednesday 13 January 2027, 10:00 in New York.
    const user = await setUp(NEW_YORK, ny("2027-01-13 10:00"));
    expect((await getReminderSettings(user.id)).weeklyReview).toBeNull();
    expect(await rowsOf(user.id)).toEqual([]);

    const settings = await weeklyReviewAt(user.id, SUNDAY, "18:00");

    expect(settings.weeklyReview).toEqual({ day: SUNDAY, time: "18:00" });
    expect(await rowsOf(user.id)).toMatchObject([
      {
        kind: "weekly_review",
        status: "scheduled",
        taskId: null,
        eventId: null,
        occurrenceStart: null,
        targetAt: ny("2027-01-17 18:00"),
        fireAt: ny("2027-01-17 18:00"),
      },
    ]);
    const events = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.userId, user.id),
          eq(auditEvents.eventType, "user_preferences.updated"),
        ),
      )
      .orderBy(asc(auditEvents.occurredAt));
    expect(events.at(-1)!.changes).toEqual({
      weeklyReviewDay: { from: null, to: SUNDAY },
      weeklyReviewTime: { from: null, to: "18:00" },
    });

    // Saving it unchanged is a no-op with no event.
    await weeklyReviewAt(user.id, SUNDAY, "18:00");
    expect(
      await db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.userId, user.id)),
    ).toHaveLength(events.length);
  });

  it("takes today while the time is still ahead, and next week once it has passed", async () => {
    const user = await setUp(NEW_YORK, ny("2027-01-13 10:00"));

    await weeklyReviewAt(user.id, WEDNESDAY, "10:30");
    expect((await scheduledReview(user.id))!.targetAt).toEqual(
      ny("2027-01-13 10:30"),
    );

    await weeklyReviewAt(user.id, WEDNESDAY, "09:30");
    expect((await scheduledReview(user.id))!.targetAt).toEqual(
      ny("2027-01-20 09:30"),
    );
  });

  it("moves with a changed day or time and goes when turned off", async () => {
    const user = await setUp(NEW_YORK, ny("2027-01-13 10:00"));
    await weeklyReviewAt(user.id, SUNDAY, "18:00");

    await weeklyReviewAt(user.id, 5, "16:15"); // Friday
    expect(await reviewRows(user.id)).toMatchObject([
      { status: "scheduled", targetAt: ny("2027-01-15 16:15") },
    ]);

    const settings = await saveSettings(user.id);
    expect(settings.weeklyReview).toBeNull();
    expect(await rowsOf(user.id)).toEqual([]);
    const [preferences] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, user.id));
    expect(preferences).toMatchObject({
      weeklyReviewDay: null,
      weeklyReviewTime: null,
    });
  });

  it("keeps its own row beside the daily nudge's", async () => {
    const user = await setUp(NEW_YORK, ny("2027-01-13 10:00"));

    await weeklyReviewAt(user.id, SUNDAY, "18:00", {
      dailyNudgeTime: "08:00",
    });

    expect(
      (await rowsOf(user.id)).map(({ kind, status }) => [kind, status]),
    ).toEqual([
      ["daily_nudge", "scheduled"],
      ["weekly_review", "scheduled"],
    ]);
    // Turning the nudge off leaves the weekly review alone, and back.
    await weeklyReviewAt(user.id, SUNDAY, "18:00");
    expect((await rowsOf(user.id)).map(({ kind }) => kind)).toEqual([
      "weekly_review",
    ]);
    await saveSettings(user.id, { dailyNudgeTime: "08:00" });
    expect((await rowsOf(user.id)).map(({ kind }) => kind)).toEqual([
      "daily_nudge",
    ]);
  });

  it("waits for a confirmed time zone, then schedules in it", async () => {
    const user = await setUp(null, ny("2027-01-13 10:00"));

    await weeklyReviewAt(user.id, SUNDAY, "18:00");
    expect(await rowsOf(user.id)).toEqual([]);

    await savePreferences(user.id, {
      timezone: NEW_YORK,
      locale: "en-GB",
      weekStart: 1,
    });
    expect((await scheduledReview(user.id))!.targetAt).toEqual(
      ny("2027-01-17 18:00"),
    );
  });

  it("changes only the user's own reminder", async () => {
    const user = await setUp(NEW_YORK, ny("2027-01-13 10:00"));
    const other = await setUp(NEW_YORK, ny("2027-01-13 10:00"));
    await weeklyReviewAt(other.id, SUNDAY, "18:00");

    await weeklyReviewAt(user.id, 6, "09:00");
    await saveSettings(user.id);

    expect(await rowsOf(user.id)).toEqual([]);
    expect(await reviewRows(other.id)).toMatchObject([
      { status: "scheduled", targetAt: ny("2027-01-17 18:00") },
    ]);
  });

  it("can't be snoozed", async () => {
    const user = await setUp(NEW_YORK, ny("2027-01-17 17:00"));
    await weeklyReviewAt(user.id, SUNDAY, "18:00");
    await sweepAt(ny("2027-01-17 18:00"));
    const [delivered] = await reviewRows(user.id);
    expect(delivered!.status).toBe("sent");

    const snoozing = snoozeReminder(
      user.id,
      { id: delivered!.id, minutes: 15 },
      ny("2027-01-17 18:01"),
    );
    await expect(snoozing).rejects.toThrow(ConflictError);
    await expect(snoozing).rejects.toThrow(SNOOZE_WEEKLY_REVIEW);
  });
});

describe("the weekly review reminder's columns and rows", () => {
  const setRaw = (
    userId: string,
    values: Partial<typeof userPreferences.$inferInsert>,
  ) =>
    db
      .update(userPreferences)
      .set(values)
      .where(eq(userPreferences.userId, userId));

  it("need both a day and a time, or neither, and a real weekday and time", async () => {
    const user = await setUp(NEW_YORK, ny("2027-01-13 10:00"));

    for (const values of [
      { weeklyReviewDay: 0, weeklyReviewTime: null },
      { weeklyReviewDay: null, weeklyReviewTime: "18:00" },
      { weeklyReviewDay: 7, weeklyReviewTime: "18:00" },
      { weeklyReviewDay: -1, weeklyReviewTime: "18:00" },
      { weeklyReviewDay: 0, weeklyReviewTime: "24:00" },
      { weeklyReviewDay: 0, weeklyReviewTime: "6:00" },
    ]) {
      await expect(setRaw(user.id, values)).rejects.toMatchObject({
        cause: { constraint: "user_preferences_weekly_review_check" },
      });
    }
    await setRaw(user.id, { weeklyReviewDay: 6, weeklyReviewTime: "23:59" });
  });

  it("allow one scheduled weekly review row per user, beside the nudge, and link to no task or event", async () => {
    const user = await setUp(NEW_YORK, ny("2027-01-13 10:00"));
    const row = {
      userId: user.id,
      targetAt: ny("2027-01-17 18:00"),
      fireAt: ny("2027-01-17 18:00"),
    };
    await db.insert(reminders).values({ ...row, kind: "weekly_review" });
    await db.insert(reminders).values({ ...row, kind: "daily_nudge" });

    await expect(
      db.insert(reminders).values({
        ...row,
        kind: "weekly_review",
        targetAt: ny("2027-01-24 18:00"),
        fireAt: ny("2027-01-24 18:00"),
      }),
    ).rejects.toMatchObject({
      cause: { constraint: "reminders_one_scheduled_key" },
    });
    await expect(
      db.insert(reminders).values({
        ...row,
        kind: "weekly_review",
        occurrenceStart: row.targetAt,
        status: "sent",
        sentAt: row.targetAt,
      }),
    ).rejects.toMatchObject({ cause: { constraint: "reminders_link_check" } });
  });
});

// --- Delivery --------------------------------------------------------------------

describe("delivering the weekly review reminder", () => {
  it("sends fixed text opening the review, with no snooze, then rolls to the next week", async () => {
    const user = await setUp(NEW_YORK, ny("2027-01-13 10:00"));
    await weeklyReviewAt(user.id, SUNDAY, "18:00");

    // A claim takes what fires before the next sweep, so a reminder on a
    // quarter hour goes out at that sweep.
    await sweepEvery15(ny("2027-01-17 17:15"), ny("2027-01-17 18:30"));

    expect(sent).toEqual([
      {
        at: ny("2027-01-17 18:00"),
        payload: {
          title: "Time for your weekly review",
          url: "/review",
          tag: expect.stringMatching(/^reminder-/),
        },
      },
    ]);
    expect(await reviewRows(user.id)).toMatchObject([
      { status: "sent", targetAt: ny("2027-01-17 18:00") },
      { status: "scheduled", targetAt: ny("2027-01-24 18:00") },
    ]);
  });

  it("says the same in private mode", async () => {
    const user = await setUp(NEW_YORK, ny("2027-01-13 10:00"));
    await weeklyReviewAt(user.id, SUNDAY, "18:00", {
      remindersPrivate: true,
    });

    await sweepAt(ny("2027-01-17 18:00"));

    expect(sent.map(({ payload }) => payload.title)).toEqual([
      "Time for your weekly review",
    ]);
  });

  it("comes even when that week's review is already finished", async () => {
    const user = await setUp(NEW_YORK, ny("2027-01-17 10:00"));
    await weeklyReviewAt(user.id, SUNDAY, "18:00");
    const review = await startWeeklyReview(user.id, {
      periodStart: "2027-01-11",
    });
    await finishWeeklyReview(user.id, { id: review.id });

    await sweepAt(ny("2027-01-17 18:00"));

    expect(sentTimes()).toEqual([ny("2027-01-17 18:00")]);
  });

  it("is skipped while reminders are off, and next week's still comes once they're back on", async () => {
    const user = await setUp(NEW_YORK, ny("2027-01-13 10:00"));
    await weeklyReviewAt(user.id, SUNDAY, "18:00", {
      remindersEnabled: false,
    });

    await sweepAt(ny("2027-01-17 18:00"));
    expect(sent).toEqual([]);
    expect(await reviewRows(user.id)).toMatchObject([
      { status: "skipped", skipReason: "disabled" },
      { status: "scheduled", targetAt: ny("2027-01-24 18:00") },
    ]);

    vi.setSystemTime(ny("2027-01-20 12:00"));
    await weeklyReviewAt(user.id, SUNDAY, "18:00");
    await sweepAt(ny("2027-01-24 18:00"));
    expect(sentTimes()).toEqual([ny("2027-01-24 18:00")]);
  });

  it("is skipped with no device, and rolls on", async () => {
    const user = await setUp(NEW_YORK, ny("2027-01-13 10:00"), {
      device: false,
    });
    await weeklyReviewAt(user.id, SUNDAY, "18:00");

    await sweepAt(ny("2027-01-17 18:00"));

    expect(await reviewRows(user.id)).toMatchObject([
      { status: "skipped", skipReason: "no_device" },
      { status: "scheduled", targetAt: ny("2027-01-24 18:00") },
    ]);
  });

  it("waits for quiet hours to end on its day, and is skipped as stale when they end the next day", async () => {
    // Quiet 22:00–07:00. At 06:30 on a Sunday it waits until 07:00; at
    // 23:00 the next Sunday the hours end on Monday, after its day ended.
    const user = await setUp(NEW_YORK, ny("2027-01-13 10:00"));
    await weeklyReviewAt(user.id, SUNDAY, "06:30", {
      quietHours: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    });

    await sweepAt(ny("2027-01-17 06:30"));
    expect(await scheduledReview(user.id)).toMatchObject({
      targetAt: ny("2027-01-17 06:30"),
      heldUntil: ny("2027-01-17 07:00"),
    });
    await sweepEvery15(ny("2027-01-17 06:45"), ny("2027-01-17 07:15"));
    expect(sentTimes()).toEqual([ny("2027-01-17 07:00")]);

    vi.setSystemTime(ny("2027-01-18 12:00"));
    await weeklyReviewAt(user.id, SUNDAY, "23:00", {
      quietHours: true,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    });
    await sweepAt(ny("2027-01-24 23:00"));
    expect((await scheduledReview(user.id))!.heldUntil).toEqual(
      ny("2027-01-25 07:00"),
    );
    await sweepAt(ny("2027-01-25 07:00"));

    expect(sentTimes()).toEqual([ny("2027-01-17 07:00")]);
    expect(await reviewRows(user.id)).toMatchObject([
      { status: "sent", targetAt: ny("2027-01-17 06:30") },
      {
        status: "skipped",
        skipReason: "stale",
        targetAt: ny("2027-01-24 23:00"),
      },
      { status: "scheduled", targetAt: ny("2027-01-31 23:00") },
    ]);
  });

  it("sends late on its own day after missed sweeps, but not once the day is over", async () => {
    const user = await setUp(NEW_YORK, ny("2027-01-13 10:00"));
    await weeklyReviewAt(user.id, SUNDAY, "09:00");

    // No sweep until Sunday evening: still its day, so it goes.
    await sweepAt(ny("2027-01-17 20:00"));
    expect(sentTimes()).toEqual([ny("2027-01-17 20:00")]);

    // No sweep from Saturday until Monday: next week's is stale.
    await sweepAt(ny("2027-01-23 12:00"));
    await sweepAt(ny("2027-01-25 00:15"));
    expect(sent).toHaveLength(1);
    expect(await reviewRows(user.id)).toMatchObject([
      { status: "sent" },
      { status: "skipped", skipReason: "stale" },
      { status: "scheduled", targetAt: ny("2027-01-31 09:00") },
    ]);
  });
});

// --- A DST week (America/New_York) ------------------------------------------------
//
// In 2027 New York springs forward on Sunday 14 March (02:00 EST → 03:00
// EDT, UTC−5 → UTC−4) and falls back on Sunday 7 November (02:00 EDT →
// 01:00 EST).

describe("the weekly review reminder across DST weeks in New York", () => {
  it("keeps 09:00 local on the Sundays before, of and after spring-forward, once each", async () => {
    const user = await setUp(NEW_YORK, ny("2027-03-03 12:00"));
    await weeklyReviewAt(user.id, SUNDAY, "09:00");

    for (const sunday of ["2027-03-07", "2027-03-14", "2027-03-21"]) {
      await sweepEvery15(ny(`${sunday} 07:00`), ny(`${sunday} 10:00`));
    }

    expect(sentTimes()).toEqual([
      iso("2027-03-07T14:00:00Z"), // 09:00 EST
      iso("2027-03-14T13:00:00Z"), // 09:00 EDT
      iso("2027-03-21T13:00:00Z"),
    ]);
    expect((await scheduledReview(user.id))!.targetAt).toEqual(
      iso("2027-03-28T13:00:00Z"),
    );
  });

  it("keeps 09:00 local across fall-back", async () => {
    const user = await setUp(NEW_YORK, ny("2027-11-01 12:00"));
    await weeklyReviewAt(user.id, SUNDAY, "09:00");

    for (const sunday of ["2027-11-07", "2027-11-14"]) {
      await sweepEvery15(ny(`${sunday} 07:00`), ny(`${sunday} 10:00`));
    }

    expect(sentTimes()).toEqual([
      iso("2027-11-07T14:00:00Z"), // 09:00 EST
      iso("2027-11-14T14:00:00Z"),
    ]);
  });

  it("reminds once at a time spring-forward skips, an hour later, then at the time again", async () => {
    const user = await setUp(NEW_YORK, ny("2027-03-10 12:00"));
    await weeklyReviewAt(user.id, SUNDAY, "02:30");
    // 02:30 doesn't exist on 14 March: it resolves to 03:30 EDT (07:30 UTC).
    expect((await scheduledReview(user.id))!.targetAt).toEqual(
      iso("2027-03-14T07:30:00Z"),
    );

    await sweepEvery15(
      iso("2027-03-14T05:00:00Z"),
      iso("2027-03-14T09:00:00Z"),
    );
    await sweepEvery15(
      iso("2027-03-21T05:00:00Z"),
      iso("2027-03-21T07:00:00Z"),
    );

    expect(sentTimes()).toEqual([
      iso("2027-03-14T07:30:00Z"), // 03:30 EDT
      iso("2027-03-21T06:30:00Z"), // 02:30 EDT
    ]);
  });

  it("reminds once at a time fall-back repeats, at its first", async () => {
    const user = await setUp(NEW_YORK, ny("2027-11-03 12:00"));
    await weeklyReviewAt(user.id, SUNDAY, "01:30");

    await sweepEvery15(
      iso("2027-11-07T04:00:00Z"),
      iso("2027-11-07T08:00:00Z"),
    );

    expect(sentTimes()).toEqual([iso("2027-11-07T05:30:00Z")]); // 01:30 EDT
    expect(await reviewRows(user.id)).toMatchObject([
      { status: "sent", targetAt: iso("2027-11-07T05:30:00Z") },
      // The next Sunday's 01:30 is EST (06:30 UTC).
      { status: "scheduled", targetAt: iso("2027-11-14T06:30:00Z") },
    ]);
  });
});

// --- A time-zone change ------------------------------------------------------------

describe("the weekly review reminder when the user changes time zone", () => {
  it("moves to the chosen day and time in the new zone, with the nudge, and is sent there", async () => {
    // Wednesday 13 January, 10:00 in New York (Thursday 00:00 in Tokyo).
    const user = await setUp(NEW_YORK, ny("2027-01-13 10:00"));
    await weeklyReviewAt(user.id, SUNDAY, "18:00", { dailyNudgeTime: "08:00" });
    expect((await scheduledReview(user.id))!.targetAt).toEqual(
      ny("2027-01-17 18:00"),
    );

    await savePreferences(user.id, {
      timezone: TOKYO,
      locale: "en-GB",
      weekStart: 1,
    });

    const tokyoSunday = local(TOKYO, "2027-01-17 18:00");
    expect(await rowsOf(user.id)).toMatchObject([
      {
        kind: "daily_nudge",
        status: "scheduled",
        targetAt: local(TOKYO, "2027-01-14 08:00"),
      },
      { kind: "weekly_review", status: "scheduled", targetAt: tokyoSunday },
    ]);

    await sweepAt(plusMinutes(tokyoSunday, -10));
    expect(sent.map(({ at, payload }) => [at, payload.title])).toEqual([
      [plusMinutes(tokyoSunday, -10), "Time for your weekly review"],
    ]);
  });

  it("stays put when only the locale or week start changes", async () => {
    const user = await setUp(NEW_YORK, ny("2027-01-13 10:00"));
    await weeklyReviewAt(user.id, SUNDAY, "18:00");
    const [before] = await reviewRows(user.id);

    await savePreferences(user.id, {
      timezone: NEW_YORK,
      locale: "en-US",
      weekStart: 0,
    });

    expect(await reviewRows(user.id)).toEqual([before]);
  });
});
