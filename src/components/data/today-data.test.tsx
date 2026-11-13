import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ScheduleEntry } from "@/lib/schedule";
import { eventEntry } from "@/lib/agenda";
import { PriorityMark } from "./priority-mark";
import { Timeline } from "./timeline";

const date = "2026-11-13";

function event(
  id: string,
  title: string,
  start: string,
  end: string,
  allDay: boolean,
): ScheduleEntry {
  const base = {
    id,
    title,
    userId: "user",
    description: null,
    location: null,
    goalId: null,
    lifeAreaId: null,
    rrule: null,
    reminderOffsetMinutes: null,
    source: "internal" as const,
    externalId: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    originalStart: null,
    seriesId: null,
    modified: false,
  };
  return eventEntry(
    allDay
      ? {
          ...base,
          allDay: true,
          startDate: start,
          endDate: end,
          startAt: null,
          endAt: null,
          tz: null,
        }
      : {
          ...base,
          allDay: false,
          startAt: new Date(start),
          endAt: new Date(end),
          tz: "UTC",
          startDate: null,
          endDate: null,
        },
  );
}

describe("Today data components", () => {
  it("keeps the priority available as text to assistive technology", () => {
    expect(render(<PriorityMark priority="high" />)).toContain(
      'role="img" aria-label="High priority"',
    );
  });

  it("links all-day and timed entries and marks only the current timed entry", () => {
    const html = render(
      <Timeline
        today={date}
        now={new Date(`${date}T10:00:00Z`)}
        locale="en-GB"
        timeZone="UTC"
        entries={[
          event("all-day", "Library sale", date, "2026-11-14", true),
          event(
            "earlier",
            "Early train",
            `${date}T08:00:00Z`,
            `${date}T09:00:00Z`,
            false,
          ),
          event(
            "active",
            "Open studio",
            `${date}T09:30:00Z`,
            `${date}T11:00:00Z`,
            false,
          ),
        ]}
      />,
    );
    expect(html.indexOf("All day: Library sale")).toBeLessThan(
      html.indexOf("Early train"),
    );
    expect(html.match(/>Now</g)).toHaveLength(1);
    expect(html).toContain(
      'href="/plan/calendar?view=day&amp;item=event%3Aactive',
    );
  });
});
