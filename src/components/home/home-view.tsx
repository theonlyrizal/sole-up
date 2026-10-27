import Link from "next/link";

import { buttonClass } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { agendaEntryKind } from "@/lib/agenda";
import { calendarItemHref } from "@/lib/calendar-views";
import type { LocalDate } from "@/lib/dates";
import { commitmentWhenLabel, type ScheduleEntry } from "@/lib/schedule";
import { TODAY_SECTION_LABELS, todaySectionAnchor } from "@/lib/today";
import type {
  GoalWithoutNextAction,
  TodayTaskCounts,
} from "@/server/modules/metrics/home";
import type { Metric } from "@/server/modules/metrics/metric";

import { metricAsOfLabel, metricRangeLabel } from "./metric-range";
import { RefreshOnNewDay } from "./refresh-on-new-day";

// Home's summaries (chunk 3.2). Every number comes from the metrics module
// with its definition and range, and links to the list it counts. A card
// with nothing to look at says "Nothing yet" instead of a zero. There is
// deliberately no overall score.

const GOALS_LIST_ID = "goals-without-next-action";

type HomeViewProps = {
  next: Metric<ScheduleEntry | null>;
  today: Metric<TodayTaskCounts>;
  goals: Metric<number>;
  goalList: GoalWithoutNextAction[];
  deadlines: Metric<number>;
  todayDate: LocalDate;
  nextDayStartsAt: string;
  locale: string;
  timeZone: string;
};

type CardContext = { todayDate: LocalDate; locale: string };

export function HomeView({
  next,
  today,
  goals,
  goalList,
  deadlines,
  todayDate,
  nextDayStartsAt,
  locale,
  timeZone,
}: HomeViewProps) {
  const context = { todayDate, locale };
  return (
    <div className="flex flex-col gap-4">
      <RefreshOnNewDay nextDayStartsAt={nextDayStartsAt} />
      <MetricCard
        id="home-next"
        title="Next commitment"
        metric={next}
        empty={{
          description:
            "Events and time blocks you add to the calendar show here, starting with the next one.",
        }}
        {...context}
      >
        {next.value === null ? (
          <p className="text-sm text-muted">
            Nothing coming up in the next 30 days.
          </p>
        ) : (
          <NextCommitment
            entry={next.value}
            now={next.range.asOf}
            todayDate={todayDate}
            locale={locale}
            timeZone={timeZone}
          />
        )}
      </MetricCard>

      <MetricCard
        id="home-today"
        title="Today"
        metric={today}
        empty={{
          description:
            "Tasks you plan for today, or that fall due, are counted here. Use Add task to capture one.",
        }}
        {...context}
      >
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {(["planned", "due", "decide"] as const).map((section) => (
            <li key={section}>
              <CountLink
                href={`/plan/today#${todaySectionAnchor(section)}`}
                count={today.value[section]}
                label={TODAY_SECTION_LABELS[section]}
              />
            </li>
          ))}
        </ul>
      </MetricCard>

      <MetricCard
        id="home-goals"
        title="Goals without a next action"
        metric={goals}
        empty={{
          description:
            "Once you have an active goal, this shows the ones with no dated task yet.",
          link: { href: "/goals", label: "Add a goal" },
        }}
        {...context}
      >
        <CountLink
          href={`#${GOALS_LIST_ID}`}
          count={goals.value}
          label={goals.value === 1 ? "goal" : "goals"}
        />
        {goalList.length === 0 ? (
          <p id={GOALS_LIST_ID} className="text-sm text-muted">
            Every active goal has a next action.
          </p>
        ) : (
          <ul
            id={GOALS_LIST_ID}
            aria-label="Goals without a next action"
            className="flex flex-col divide-y divide-border rounded-md border border-border"
          >
            {goalList.map((goal) => (
              <li key={goal.id} className="px-3 py-2">
                <Link
                  href={`/goals/${goal.id}`}
                  className={cx("rounded-sm hover:underline", focusRing)}
                >
                  {goal.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </MetricCard>

      <MetricCard
        id="home-deadlines"
        title="Deadlines in the next 7 days"
        metric={deadlines}
        empty={{
          description: "Tasks with a due date are counted here.",
        }}
        {...context}
      >
        <CountLink
          href="/plan?due=next7"
          count={deadlines.value}
          label={deadlines.value === 1 ? "deadline" : "deadlines"}
        />
      </MetricCard>
    </div>
  );
}

function MetricCard({
  id,
  title,
  metric,
  empty,
  todayDate,
  locale,
  children,
}: CardContext & {
  id: string;
  title: string;
  metric: Metric<unknown>;
  empty: { description: string; link?: { href: string; label: string } };
  children: React.ReactNode;
}) {
  const headingId = `${id}-heading`;
  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
    >
      <h2 id={headingId} className="text-lg font-semibold">
        {title}
      </h2>
      {metric.hasData ? (
        children
      ) : (
        <div className="flex flex-col items-start gap-2">
          <p className="text-lg font-medium">Nothing yet</p>
          <p className="text-sm text-muted">{empty.description}</p>
          {empty.link && (
            <Link
              href={empty.link.href}
              className={buttonClass({ variant: "secondary", size: "sm" })}
            >
              {empty.link.label}
            </Link>
          )}
        </div>
      )}
      <div className="flex flex-col gap-2 border-t border-border pt-3 text-sm text-muted">
        <p>{metric.definition}</p>
        <dl className="flex flex-wrap gap-x-4 gap-y-1">
          <div className="flex gap-1">
            <dt>Range:</dt>
            <dd>{metricRangeLabel(metric.range, todayDate, locale)}</dd>
          </div>
          <div className="flex gap-1">
            <dt>As of:</dt>
            <dd>
              <time dateTime={metric.range.asOf.toISOString()}>
                {metricAsOfLabel(metric.range, locale)}
              </time>
            </dd>
          </div>
        </dl>
      </div>
    </section>
  );
}

/**
 * The next event or time block: what it is, its title linking to it in the
 * calendar (its dialog opens there), and when.
 */
function NextCommitment({
  entry,
  now,
  todayDate,
  locale,
  timeZone,
}: {
  entry: ScheduleEntry;
  now: Date;
  todayDate: LocalDate;
  locale: string;
  timeZone: string;
}) {
  return (
    <div className="flex flex-col items-start gap-1">
      <p className="text-sm text-muted">{agendaEntryKind(entry)}</p>
      <Link
        href={calendarItemHref(entry, todayDate, timeZone)}
        className={cx(
          "rounded-sm text-xl font-semibold break-words hover:underline",
          focusRing,
        )}
      >
        {entry.title}
      </Link>
      <p>{commitmentWhenLabel(entry, now, todayDate, locale, timeZone)}</p>
    </div>
  );
}

/** A count and what it counts, linking to that list. */
function CountLink({
  href,
  count,
  label,
}: {
  href: string;
  count: number;
  label: string;
}) {
  return (
    <Link
      href={href}
      className={cx(
        "inline-flex flex-col rounded-md px-1 hover:underline",
        focusRing,
      )}
    >
      <span className="text-3xl font-semibold tabular-nums">{count}</span>{" "}
      <span className="text-sm">{label}</span>
    </Link>
  );
}
