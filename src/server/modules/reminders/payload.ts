// What a reminder notification says and opens (ADR 0013). Pure, so the
// unit tests cover the wording; the sweep passes in the item's title, or
// null in private mode so a title never reaches the payload.
//
// - A task: "Due 17:00 · Submit visa form"; an event: "Dentist · 14:00 (in
//   10 min)". Never a description, location, reason or note.
// - Private mode: "You have a reminder · 14:00".
// - The nudge and a quiet-hours bundle never carry titles in either mode.
// - The link holds IDs and instants only: the item's dialog on the Day view
//   (4.9's `?item=`), or Today for the nudge and a bundle.

import { calendarItemHref } from "@/lib/calendar-views";
import {
  daysBetween,
  formatTimeOfDay,
  localDateOf,
  todayFor,
} from "@/lib/dates";
import type { PushPayload } from "@/lib/push";

const TODAY_PATH = "/plan/today";

export const NUDGE_TEXT = "Time to plan your day";

/** One reminder's subject, as the sweep loaded it. */
export type ReminderSubject =
  | {
      kind: "task_deadline";
      reminderId: string;
      taskId: string;
      targetAt: Date;
      /** Null in private mode. */
      title: string | null;
    }
  | {
      kind: "event";
      reminderId: string;
      eventId: string;
      /** A repeating event occurrence's original start; null otherwise. */
      occurrenceStart: Date | null;
      targetAt: Date;
      /** Null in private mode. */
      title: string | null;
    }
  | { kind: "daily_nudge"; reminderId: string };

/** The user's clock and formatting at the sweep. */
export type MessageContext = {
  now: Date;
  timeZone: string;
  locale: string;
};

/** Local days from the sweep's day to the target's. */
function daysAhead(target: Date, { now, timeZone }: MessageContext): number {
  return daysBetween(todayFor(timeZone, now), localDateOf(target, timeZone));
}

/** "14:00" today, "tomorrow 14:00", or "Wed 14:00" further out. */
export function whenLabel(target: Date, context: MessageContext): string {
  const { timeZone, locale } = context;
  const time = formatTimeOfDay(target, locale, timeZone);
  const days = daysAhead(target, context);
  if (days <= 0) return time;
  if (days === 1) return `tomorrow ${time}`;
  const weekday = new Intl.DateTimeFormat(locale, {
    weekday: "short",
    timeZone,
  }).format(target);
  return `${weekday} ${time}`;
}

/** "(in 10 min)", "(in 1 h)" or "(now)", for a target later today. */
function startsIn(target: Date, now: Date): string {
  const minutes = Math.round((target.getTime() - now.getTime()) / 60_000);
  if (minutes <= 0) return "(now)";
  if (minutes < 60) return `(in ${minutes} min)`;
  return `(in ${Math.round(minutes / 60)} h)`;
}

function linkFor(subject: ReminderSubject, context: MessageContext): string {
  const today = todayFor(context.timeZone, context.now);
  const timed = (id: string, targetAt: Date) =>
    calendarItemHref(
      { id, allDay: false, start: targetAt.toISOString() },
      today,
      context.timeZone,
    );
  switch (subject.kind) {
    case "task_deadline":
      return timed(`task:${subject.taskId}:due`, subject.targetAt);
    case "event": {
      // The same key the Agenda gives the occurrence (`occurrenceKey`).
      const key = subject.occurrenceStart
        ? `${subject.eventId}:${subject.occurrenceStart.toISOString()}`
        : subject.eventId;
      return timed(`event:${key}`, subject.targetAt);
    }
    case "daily_nudge":
      return TODAY_PATH;
  }
}

/** The notification for one reminder. */
export function reminderPayload(
  subject: ReminderSubject,
  context: MessageContext,
): PushPayload {
  const url = linkFor(subject, context);
  // A resend of the same reminder replaces it rather than stacking.
  const tag = `reminder-${subject.reminderId}`;
  if (subject.kind === "daily_nudge") return { title: NUDGE_TEXT, url, tag };

  // The worker offers snooze on task and event reminders.
  const { reminderId } = subject;
  const when = whenLabel(subject.targetAt, context);
  if (subject.title === null) {
    return { title: `You have a reminder · ${when}`, url, tag, reminderId };
  }
  if (subject.kind === "task_deadline") {
    return { title: `Due ${when} · ${subject.title}`, url, tag, reminderId };
  }
  const suffix =
    daysAhead(subject.targetAt, context) <= 0
      ? ` ${startsIn(subject.targetAt, context.now)}`
      : "";
  return {
    title: `${subject.title} · ${when}${suffix}`,
    url,
    tag,
    reminderId,
  };
}

/** One notification for several reminders held by quiet hours. */
export function bundlePayload(count: number): PushPayload {
  return {
    title: `${count} reminders from quiet hours`,
    url: TODAY_PATH,
    tag: "reminders-quiet-hours",
  };
}
