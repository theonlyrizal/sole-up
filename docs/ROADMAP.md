# SoleUp Development Roadmap

**Status:** Strategic roadmap, synced with ADRs 0001–0007 on 2026-10-20.

**Delivery plan:** the chunk-by-chunk build order, progress log and acceptance checks live in [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md). This document keeps the product phases and their intent. Settled decisions are in [docs/decisions/](decisions/README.md).

The implementation plan numbers its phases differently. Roadmap Phases 0 and 1 (Core MVP) map to implementation Phases 0–10. Roadmap Phase 2 (deterministic intelligence) is largely covered by implementation Phases 3 and 9. Roadmap Phases 3–6 are in the implementation plan's "Later" table.

## Guiding strategy

Build a useful personal management product first. Add AI when the product has reliable structured data and a specific workflow that benefits from interpretation. Investigate advanced behavioral prediction only after proving demand.

## Phase 0: Project foundation

### Deliverables
- Repository conventions and environment setup.
- Product, architecture, data-model, and AI strategy documentation.
- Authentication and authorization approach.
- Database choice, migrations, and initial schema.
- Basic responsive application shell.
- Logging, error handling, linting, formatting, and tests.
- CI checks if appropriate.

### Acceptance criteria
- A new developer can run the app using documented steps.
- Secrets are not committed.
- Private routes require authentication.
- Cross-user access tests demonstrate isolation.
- Database migrations can be applied consistently.

## Phase 1: SoleUp Core MVP

### 1A. Account and preferences
- Sign up/sign in/sign out.
- Account settings.
- Time zone and locale.
- Basic privacy settings.

### 1B. Life areas and goals
- Create, edit, pause, complete, drop, and archive goals.
- Optional life-area assignment and priority.
- Optional start and target dates. Numeric measurement is deferred ([ADR 0010](decisions/0010-goal-status-priority-progress.md)).
- Milestones and progress display (completed out of non-dropped milestones).
- Goal detail page with linked activity.

### 1C. Tasks
- No Projects in v1 ([ADR 0004](decisions/0004-task-hierarchy-and-dates.md)). A task has at most one parent: a milestone, a goal, or none (inbox).
- Create, edit, complete, cancel, and reschedule tasks.
- Status, priority, a deadline (date, or instant + time zone), and an optional planned date.
- Useful filters and sorting.
- Today and upcoming views.

### 1D. Habits
- Define habit and cadence (daily, chosen weekdays, N per week), as a yes/no check or a quantity with a target ([ADR 0014](decisions/0014-habit-cadence-logs-consistency.md)).
- Log completion or a deliberate skip.
- Correct past logs.
- Pause or archive a habit.
- Show history and transparent consistency calculations.

### 1E. Notes
- Create and edit notes.
- Search and basic organization.
- Optional links to goals and other supported entities, decided at the notes decision gate.

### 1F. Calendar and reminders
- In the MVP, sequenced after the core loop (Goals → Today) ([ADR 0007](decisions/0007-platform-and-push.md)).
- Internal events, no external sync.
- Repeating events, and time blocks for tasks ([ADR 0012](decisions/0012-calendar-recurrence-time-blocks-views.md)).
- Week, Day and Agenda views. Resource views by life area follow the Phase 4 checkpoint.
- Time-zone-correct event display.
- Reminder delivery via Web Push for timed deadlines, timed events and a daily nudge, from a sweep that runs every 15 minutes on the free hosting, so reminders may arrive up to 15 minutes early ([ADR 0013](decisions/0013-reminders-sweep-and-delivery.md)).
- Notification preferences and error handling.

### 1G. Dashboard and review
- Today's priorities.
- Upcoming deadlines.
- Recent goal activity.
- Habit summary.
- Weekly review template.
- Basic, explainable analytics.

### Phase 1 acceptance criteria
- A user can create a goal, define a milestone, add actionable tasks, log habits, and review progress.
- All private data is scoped to the authenticated user.
- Empty, loading, error, and success states exist for primary flows.
- Core features work without AI.
- Important domain rules have automated tests.
- Data export and account deletion behavior are defined before public launch.

## Phase 2: Deterministic intelligence

### Deliverables
- Goal inactivity detection.
- Deadline risk and upcoming commitment summaries.
- Workload summaries.
- Habit consistency calculations based on explicit cadence.
- Planned-versus-completed analysis where records support it.
- Weekly review prompts.
- User-configurable notification rules.

### Acceptance criteria
- Each insight has a documented definition.
- Insights distinguish missing data from zero activity.
- Users can dismiss or correct relevant records.
- No LLM is required to calculate core metrics.
- Insights do not shame users or imply unsupported causes.

## Phase 3: AI-assisted review

### Deliverables
- Provider-independent LLM service.
- Minimal context builder.
- Schema-constrained review output.
- Evidence-linked highlights and recommendations.
- Usage limits, timeouts, error handling, and cost monitoring.
- Explicit AI feature controls and disclosure.

### Acceptance criteria
- AI failure does not break the core app.
- Generated output is validated before display or persistence.
- The user can edit, reject, or ignore recommendations.
- Tests cover sparse data, contradictory inputs, malicious note content, and provider failure.
- No consequential action occurs automatically.

## Phase 4: Persistent personal memory

### Deliverables
- Visible memory list.
- Memory types and provenance.
- User confirmation/correction/rejection.
- Retrieval rules and context limits.
- Expiration or re-confirmation for time-sensitive memories.
- Memory deletion and account deletion integration.

### Acceptance criteria
- Users can inspect and correct important memories.
- Facts and hypotheses are visibly distinct.
- The system does not silently promote a model inference to a user-stated fact.
- Only relevant memories enter a given AI context.
- Deletion behavior is documented and tested.

## Phase 5: Personalized planning and proactive assistance

### Potential deliverables
- Planning preferences.
- Suggested realistic task load.
- Personalized daily briefing.
- Stalled-goal alerts.
- Adaptive reminders.
- User-configured accountability style.
- Optional user-approved plan adjustments.

### Acceptance criteria
- Proactivity can be tuned or disabled.
- Recommendations include a concise rationale.
- The user approves changes to commitments.
- Notifications have rate limits and quiet-hour support.
- User feedback can improve preferences without overfitting to a single event.

## Phase 6: Validate advanced personalization

Do not commit to a digital twin or custom model yet.

Research questions:
- Do users want predictions, or do they mainly need better review and planning?
- Do predictions outperform transparent rules?
- Are predictions calibrated and understandable?
- What are the consequences of false positives and false negatives?
- Is the additional data collection worth the benefit?
- Can the feature be explained, corrected, and safely disabled?

Only proceed if research shows meaningful user value and a responsible data strategy.

## Prioritization rule

For every proposed feature, ask:
1. What user problem does it solve?
2. How frequently does that problem occur?
3. Can a simpler rule or interface solve it?
4. What data does it need?
5. What is the privacy and maintenance cost?
6. How will we know it helped?

If these cannot be answered, keep the feature in the idea backlog rather than the current sprint.
