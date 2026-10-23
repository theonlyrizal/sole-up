import type { Metadata } from "next";
import { Suspense } from "react";

import { CalendarView } from "@/components/calendar/calendar-view";
import { PlanSubnav } from "@/components/tasks/plan-subnav";
import { LoadingState } from "@/components/ui/skeleton";
import { todayFor } from "@/lib/dates";
import { supportedTimeZones } from "@/lib/preferences";
import { requireUser } from "@/server/auth/session";
import {
  CALENDAR_LIST_DAYS,
  listEventLinkOptions,
  listUpcomingEvents,
} from "@/server/modules/calendar-events/queries";
import { getUserPreferences } from "@/server/modules/preferences/service";

export const metadata: Metadata = { title: "Calendar · SoleUp" };

export default function CalendarPage() {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Calendar</h1>
        <p className="text-muted">
          Appointments and other commitments, at their times.
        </p>
      </div>
      <PlanSubnav />
      <Suspense fallback={<LoadingState label="Loading events" />}>
        <Calendar />
      </Suspense>
    </div>
  );
}

async function Calendar() {
  const user = await requireUser();
  const preferences = await getUserPreferences(user.id);
  // The shell only renders pages once a zone is confirmed.
  const timeZone = preferences.timezone ?? "UTC";
  // Days are the user's dates in their saved zone, never the server's.
  const today = todayFor(timeZone);
  const [days, options] = await Promise.all([
    listUpcomingEvents(user.id, { today, timeZone }),
    listEventLinkOptions(user.id),
  ]);
  return (
    <CalendarView
      days={days}
      today={today}
      dayCount={CALENDAR_LIST_DAYS}
      options={options}
      timeZones={supportedTimeZones()}
      userTimeZone={timeZone}
      locale={preferences.locale}
    />
  );
}
