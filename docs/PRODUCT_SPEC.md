# SoleUp Product Specification

**Status:** Working specification, synced with ADRs 0001–0007 on 2026-10-20  
**Product name:** SoleUp  
**Document purpose:** Define the product direction and constrain the first release.

## 1. Product vision

SoleUp helps people manage their goals, commitments, time, habits, projects, and personal knowledge in one connected system. Over time, it can learn from a user's stated preferences and activity history to offer increasingly relevant reviews and recommendations.

**Long-term ambition:** a personal management system that understands enough of a person's life context to help them make better decisions and follow through.

**MVP promise:** help a user decide what matters, plan realistic next steps, track follow-through, and review progress without needing AI.

## 2. Product principles

1. **User agency first.** SoleUp advises; the user decides.
2. **Connected, not cluttered.** Features should share useful context rather than become a pile of disconnected mini-apps.
3. **Realistic execution.** Planning should respect time, capacity, deadlines, and existing commitments.
4. **Reflection without shame.** Missed plans are information, not moral failure.
5. **Evidence over confident guesses.** Insights should show the activity or history behind them.
6. **Privacy by design.** Collect only what is useful and make personal data understandable and controllable.
7. **Useful without AI.** Core planning and tracking must work if AI is unavailable or disabled.
8. **Adaptable identity.** Users can revise their goals, values, priorities, and preferences over time.
9. **Progress over performative productivity.** Do not optimize for engagement at the expense of the user's life.

## 3. Intended users

### Initial audience

People who want a practical system for managing personal goals and daily responsibilities across several life areas. Early adopters may include students, professionals, developers, creators, and people navigating a major life transition.

### Problems to solve

- Goals are too vague to act on.
- Tasks, notes, calendars, and habits are scattered across tools.
- Plans ignore actual time and energy constraints.
- Users lose track of why a goal matters.
- Progress is difficult to evaluate over weeks or months.
- Reviews are inconsistent or rely on memory alone.

### Not the initial target

- Enterprise project management.
- Clinical mental-health treatment or diagnosis.
- Fully autonomous life decisions.
- Financial advising, medical diagnosis, or other regulated expert services.
- A social network or public leaderboard.

## 4. Core product model

SoleUp organizes a person's work and life through connected concepts:

- **Life areas:** broad domains such as Learning, Career, Health, Relationships, Home, and Finance.
- **Goals:** desired outcomes with a reason, target, timeframe, and status.
- **Milestones:** meaningful checkpoints within a goal.
- **Projects (later, not in v1):** finite bodies of work that produce an outcome. See [ADR 0004](decisions/0004-task-hierarchy-and-dates.md).
- **Tasks:** actionable units of work. A task belongs to at most one parent: a milestone, a goal, or none (the inbox).
- **Habits:** repeated behaviors tracked over time.
- **Calendar events and time blocks:** commitments, and time reserved for a specific task. Both can repeat. See [ADR 0012](decisions/0012-calendar-recurrence-time-blocks-views.md).
- **Notes:** information the user wants to retain.
- **Audit events:** dated records of structured changes (no user content) that make history and analytics possible. See [ADR 0005](decisions/0005-history-and-audit-log.md).
- **Reviews:** structured reflection on plans, outcomes, and adjustments.

Not every object must be linked to every other object. Relationships should be explicit where they improve planning, retrieval, or insight.

## 5. MVP scope

### Include

1. Authentication and account settings.
2. User profile, locale, time zone, and preferences.
3. Life areas.
4. Goals with status, reason, target date, and optional measurable target.
5. Milestones attached to goals.
6. Tasks with status, priority, a deadline (`due_date` or `due_at` + time zone), an optional planned date, and at most one parent (a milestone, a goal, or the inbox). No Projects in v1.
7. Today and Upcoming views.
8. Habit definitions and dated completion logs.
9. Notes with title, body, timestamps, and optional links to supported entities (decided at the notes decision gate).
10. Home with a small set of actionable summaries.
11. Basic analytics based on stored records and the audit log.
12. Weekly review workflow.
13. Calendar: internal events and time blocks for tasks, both repeatable, with no external sync. Week, Day and Agenda views, and resource views by life area after the Phase 4 checkpoint ([ADR 0012](decisions/0012-calendar-recurrence-time-blocks-views.md)). "By area" shows one day with a column per active life area plus "No area": an event sits in its own area, a time block in its task's goal's area, and an archived area gets a marked column only while it holds an item that day. "Timeline" shows the same rows across a week (by default) or a day on a horizontal time axis, one row per active life area plus "No area", with overlapping items stacked in their row.
14. Reminders delivered via Web Push to the installed PWA.
15. Data export and account deletion, implemented before inviting other users.
16. Responsive, accessible, installable (PWA) interface with loading, empty, and error states.

**Sequencing:** the core loop (Goals → Today) ships first. Calendar and reminders follow as their own phases after it. The delivery order lives in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md).

### Explicitly exclude from MVP

- Custom foundation model training.
- Predictive digital twin.
- Autonomous actions outside the application.
- Full personal finance management.
- Medical or clinical features.
- Social feeds, public profiles, and leaderboards.
- Complex team collaboration.
- Unbounded AI chat with unrestricted access to all user data.
- Automatic import from every third-party calendar, wearable, or productivity platform.
- Projects as a task parent (later, if dogfooding shows the need).
- External calendar sync.
- Native mobile apps.

## 6. Primary user journeys

### Journey A: Turn an ambition into a plan

1. User creates or selects a life area.
2. User creates a goal and describes why it matters.
3. User optionally defines a target date or measurable outcome.
4. User breaks the goal into milestones.
5. User creates tasks for the next milestone.
6. Dashboard surfaces the next useful action.

**Success condition:** a goal becomes actionable without forcing the user through excessive setup.

### Journey B: Plan the day

1. User sees due and overdue tasks, calendar commitments, and active priorities.
2. User selects a realistic set of tasks.
3. User plans tasks for today (sets a planned date).
4. User completes, reschedules, or abandons work with minimal friction.
5. The activity history reflects what happened.

**Success condition:** the plan is understandable and can be adjusted without guilt or ceremony.

### Journey C: Track a habit

1. User defines a habit and its cadence.
2. User logs a completion or a deliberate skip, if supported.
3. SoleUp displays consistency and history accurately.
4. The user can edit mistakes and pause or archive a habit.

**Success condition:** tracking is quick and historical data remains interpretable.

### Journey D: Review the week

1. SoleUp summarizes goals, tasks, habits, and commitments using actual records.
2. User reflects on wins, blockers, and changes in circumstances.
3. SoleUp helps identify what should continue, stop, or change.
4. User chooses next week's priorities.

**Success condition:** the review produces a useful adjustment, not merely a dashboard of numbers.

## 7. Navigation and information architecture

Initial destinations:

- **Home:** today's priorities, upcoming commitments, and a concise status overview.
- **Plan:** tasks (inbox, Today, Upcoming) and calendar.
- **Goals:** goals, milestones, and life areas.
- **Track:** habits and recurring activity.
- **Notes:** personal reference and contextual notes.
- **Reviews / Insights:** weekly review and analytics.
- **Settings:** account, preferences, privacy, data export, and integrations as they are added.

Navigation can change after usability testing. Avoid making every domain a top-level destination if it creates clutter.

## 8. Dashboard questions

The Home screen should help answer:

1. What matters right now?
2. What needs my attention?
3. What can I realistically do next?
4. What is approaching or at risk?
5. Is my current behavior aligned with my stated priorities?

Avoid a single opaque “life score.” Use small, explainable measures such as overdue commitments, goal activity, habit consistency, and planned-versus-completed work.

Home v1 (chunk 3.2) has three cards: today's planned, due and needs-a-decision counts; active goals without a next action, each named and linked; and deadlines in the next 7 days. Each card shows its definition, range and the time it was worked out, every number links to the list it counts, and a card with no data says "Nothing yet". There is no overall score.

Chunk 4.9 adds a "Next commitment" card above them: the first event or time block that hasn't ended (one under way counts), from today through the next 30 days, with what it is, when, and a link that opens it on the calendar's Day view. Today gains a "Schedule" timeline at the top: today's events and time blocks, all-day events first, then by start, each linking to the item the same way.

## 9. Analytics and insight rules

- Show the time range and definition for every metric.
- Distinguish missing data from zero activity.
- Avoid claiming causation from correlation.
- Do not penalize users for paused goals, rest, illness, or changed priorities.
- Let users correct activity records.
- Prefer trend and context over gamified streak pressure.
- Make metrics actionable: explain what the user can do with the information.

## 10. Personalization roadmap

Personalization is not required to launch the core product. Add it only after SoleUp has reliable structured data and a clear user benefit.

Potential later capabilities:
- User-configured planning preferences.
- Weekly review generated from relevant activity.
- Goal-stagnation and workload alerts.
- User-approved persistent memories.
- Personalized recommendation tone and intervention level.
- Explanations that cite the relevant activity records.
- Adaptive planning based on observed capacity, with user approval.

SoleUp must distinguish:
- **Descriptive self:** what the user explicitly said or what records show.
- **Predictive self:** a fallible estimate of likely behavior or preference.
- **Aspirational self:** the person the user wants to become.

Do not present these as interchangeable.

## 11. MVP success measures

Use a small set of product metrics, with privacy-respecting collection:

- Activation: percentage of new users who create a goal and an actionable next step.
- Meaningful use: users who return to plan, log activity, or review progress.
- Weekly review completion rate.
- Goal follow-through: proportion of active goals with a recent meaningful action, interpreted carefully.
- Retention over 4 and 8 weeks.
- User-reported usefulness and trust.
- Reliability: error rate, reminder delivery success, and data integrity.

Do not optimize for time spent in the app. A good personal management tool may help users leave the app and live their lives.

## 12. Open product questions

### Settled (2026-10-20)

- **Primary focus:** goal management connected to daily planning. The first loop is Goals → Today; other modules follow in phases.
- **Calendar for the first release:** internal events, shown alongside Today and Home, with no external sync. See [ADR 0007](decisions/0007-platform-and-push.md). The Phase 4 gate put repeating events and time blocks in v1, with Week, Day and Agenda views and no Month view ([ADR 0012](decisions/0012-calendar-recurrence-time-blocks-views.md)).
- **Platform:** responsive web, installable as a PWA. See [ADR 0007](decisions/0007-platform-and-push.md).
- **First audience:** the developer (dogfooding), with public-grade security. See [ADR 0002](decisions/0002-auth.md).
- **Goals without numeric targets:** progress is completed milestones out of non-dropped milestones, and a goal can have none. Numeric targets are deferred. See [ADR 0010](decisions/0010-goal-status-priority-progress.md).
- **Reminders in the first release (Phase 5 gate):**
  - Timed task deadlines, timed events (including repeating ones) and an optional daily planning nudge. One reminder per item.
  - Tasks have none by default. New events default to 10 minutes before.
  - Optional quiet hours hold reminders until they end.
  - Notifications show the title and time, or "You have a reminder" in private mode.
  - Reminders may arrive up to 15 minutes early, because production stays on free hosting.
  - See [ADR 0013](decisions/0013-reminders-sweep-and-delivery.md).
- **Habits (Phase 6 gate):**
  - Daily, chosen weekdays, or N times a week. A habit is a yes/no check or a quantity with a unit and a per-day target (partial credit).
  - Logs are "completed" or "skipped". "Missed" is shown for past expected days with no log, but never stored.
  - Skips and paused days don't count, today counts only once logged, and editing a cadence or target applies from the current week on.
  - Consistency is a count such as "12 of 14 days", never a percentage or a score.
  - See [ADR 0014](decisions/0014-habit-cadence-logs-consistency.md).

### Still open

Resolve these at the phase decision gates in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md), through prototyping or feedback rather than guessing:

- What is the minimum useful weekly review? (Phase 7 gate)
- Should notes be simple, or should they support backlinks and tags? (Phase 8 gate)
