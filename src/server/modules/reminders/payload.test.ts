import { describe, expect, it } from "vitest";

import { instantFromLocal } from "@/lib/dates";

import {
  bundlePayload,
  NUDGE_TEXT,
  reminderPayload,
  type MessageContext,
} from "./payload";

const ZONE = "Europe/London";
const at = (date: string, time: string) => instantFromLocal(date, time, ZONE);
const context: MessageContext = {
  now: at("2027-01-11", "13:45"),
  timeZone: ZONE,
  locale: "en-GB",
};

const TASK_ID = "0b6c6d0e-0000-4000-8000-000000000001";
const EVENT_ID = "0b6c6d0e-0000-4000-8000-000000000002";

describe("reminderPayload", () => {
  it("names an event with its time and how soon it starts, opening its dialog on Day, with snooze", () => {
    const payload = reminderPayload(
      {
        kind: "event",
        reminderId: "r1",
        eventId: EVENT_ID,
        occurrenceStart: null,
        targetAt: at("2027-01-11", "14:00"),
        title: "Dentist",
      },
      context,
    );
    expect(payload).toEqual({
      title: "Dentist · 14:00 (in 15 min)",
      url: `/plan/calendar?view=day&item=event%3A${EVENT_ID}`,
      tag: "reminder-r1",
      reminderId: "r1",
    });
  });

  it("links a repeating event's occurrence by its original start", () => {
    const original = at("2027-01-12", "09:00");
    const payload = reminderPayload(
      {
        kind: "event",
        reminderId: "r2",
        eventId: EVENT_ID,
        occurrenceStart: original,
        targetAt: at("2027-01-12", "10:00"),
        title: "Standup",
      },
      context,
    );
    expect(payload.title).toBe("Standup · tomorrow 10:00");
    const url = new URL(payload.url!, "https://soleup.invalid");
    expect(url.searchParams.get("date")).toBe("2027-01-12");
    expect(url.searchParams.get("item")).toBe(
      `event:${EVENT_ID}:${original.toISOString()}`,
    );
  });

  it("says when a task is due, and opens the task's dialog", () => {
    const payload = reminderPayload(
      {
        kind: "task_deadline",
        reminderId: "r3",
        taskId: TASK_ID,
        targetAt: at("2027-01-11", "17:00"),
        title: "Submit visa form",
      },
      context,
    );
    expect(payload.title).toBe("Due 17:00 · Submit visa form");
    expect(payload.url).toBe(
      `/plan/calendar?view=day&item=task%3A${TASK_ID}%3Adue`,
    );
  });

  it("leaves the title out in private mode", () => {
    const payload = reminderPayload(
      {
        kind: "task_deadline",
        reminderId: "r4",
        taskId: TASK_ID,
        targetAt: at("2027-01-11", "17:00"),
        title: null,
      },
      context,
    );
    expect(payload.title).toBe("You have a reminder · 17:00");
    // Snooze still works: the ID says nothing about the task.
    expect(payload.reminderId).toBe("r4");
  });

  it("names a day further out by its weekday", () => {
    const payload = reminderPayload(
      {
        kind: "event",
        reminderId: "r5",
        eventId: EVENT_ID,
        occurrenceStart: null,
        targetAt: at("2027-01-13", "08:00"),
        title: null,
      },
      context,
    );
    expect(payload.title).toBe("You have a reminder · Wed 08:00");
  });

  it("sends the nudge without a title or snooze, opening Today", () => {
    expect(
      reminderPayload({ kind: "daily_nudge", reminderId: "r6" }, context),
    ).toEqual({ title: NUDGE_TEXT, url: "/plan/today", tag: "reminder-r6" });
  });
});

describe("bundlePayload", () => {
  it("counts the reminders and opens Today", () => {
    expect(bundlePayload(3)).toEqual({
      title: "3 reminders from quiet hours",
      url: "/plan/today",
      tag: "reminders-quiet-hours",
    });
  });
});
