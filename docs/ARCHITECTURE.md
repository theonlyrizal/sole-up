# SoleUp Architecture

**Status:** Initial proposal, subject to repository inspection and implementation decisions.

## 1. Architectural goals

- Keep the core product useful without an LLM.
- Make user data ownership and authorization explicit.
- Support connected personal data and historical analytics.
- Allow AI providers to change without rewriting domain logic.
- Prefer a modular monolith until scale or team structure justifies splitting services.
- Keep the system understandable for a small team or solo developer.

## 2. Proposed high-level architecture

```text
Browser / PWA
    |
    v
Frontend application
    |
    v
Application API / Server Actions
    |
    +---- Authentication and authorization
    |
    +---- Domain modules
    |       +-- Goals and life areas
    |       +-- Tasks (Projects later)
    |       +-- Habits
    |       +-- Audit log
    |       +-- Calendar and reminders
    |       +-- Notes
    |       +-- Reviews and analytics
    |
    +---- Persistence layer
    |       +-- PostgreSQL
    |       +-- Object storage only if needed
    |
    +---- Background jobs
    |       +-- Reminder delivery
    |       +-- Scheduled summaries
    |
    +---- Intelligence service (later)
            +-- Context retrieval
            +-- Rules and analytics
            +-- LLM provider adapter
```

Keep this as a conceptual map. If using Next.js, some API and server functionality may live in the same application rather than a separate Node/Express service. Avoid adding a separate backend solely for architectural fashion.

## 3. Suggested technology direction

Preferred starting point for a new project:

- **Frontend:** React with Next.js, or React with a separate API if that best fits the deployment and learning goals.
- **Language:** TypeScript is worth considering for domain-heavy software, but follow the developer's actual preference and project constraints rather than converting an existing codebase without reason.
- **Database:** PostgreSQL.
- **Data access:** a maintained ORM/query layer with migrations, selected after comparing project needs.
- **Authentication:** a maintained provider or carefully implemented secure session system.
- **Validation:** a shared schema-validation approach at API boundaries.
- **Testing:** unit tests for domain logic, integration tests for persistence/auth, and end-to-end tests for critical journeys.
- **Deployment:** managed application hosting and managed PostgreSQL initially.
- **AI:** an existing LLM API behind a provider-independent adapter.
- **Jobs:** managed scheduled jobs or a queue when reminders and recurring tasks require reliable execution.

This was the starting proposal. The concrete choices are now settled in [ADR 0001](decisions/0001-stack.md) (stack), [ADR 0002](decisions/0002-auth.md) (auth) and [ADR 0003](decisions/0003-hosting-and-jobs.md) (hosting and jobs).

## 4. Modular monolith

Use domain modules with clear responsibilities. A module should own its domain rules and persistence operations, and expose a small service interface to other modules.

Possible modules:
- `auth`
- `users`
- `life-areas`
- `goals`
- `projects` (later, not in v1)
- `tasks`
- `habits`
- `calendar`
- `notes`
- `audit`
- `reviews`
- `analytics`
- `notifications`
- `intelligence` (later)

Avoid circular dependencies and avoid having every module import arbitrary database internals from every other module.

## 5. Data flow and domain boundaries

- UI components display state and collect user input.
- API/application handlers authenticate, authorize, validate, and orchestrate.
- Domain services implement rules and transitions.
- Persistence code reads and writes data.
- Analytics derives metrics from stored records.
- Intelligence combines selected records and deterministic findings into a bounded context for model-assisted interpretation.

Do not place authorization only in the UI. Do not let an LLM decide whether a database operation is authorized.

## 6. Identity, ownership, and access control

Every private record must have an explicit owner or access context.

For a single-user personal record:
- Verify the authenticated user.
- Scope reads, updates, and deletes by both record ID and owner ID.
- Return a consistent not-found/unauthorized response policy that does not leak another user's data.
- Test cross-user access attempts.

For future shared records, model sharing explicitly with membership/permission tables. Do not make a record public merely to support a future feature.

## 7. Time and scheduling

- Persist timestamps for real-world instants in UTC.
- Store each user's IANA time-zone identifier, such as `Asia/Dhaka`.
- Treat all-day dates separately from timestamped events.
- Define recurring habit and reminder behavior carefully across time-zone and daylight-saving changes.
- Make date boundaries explicit in analytics.
- Test reminders around midnight, time-zone changes, and daylight-saving transitions where relevant.

## 8. Background jobs and notifications

Reminder delivery should not depend on a browser tab remaining open.

For reliable reminders:
- Persist the scheduled event and delivery status.
- Use a scheduler/queue appropriate to the hosting environment.
- Make job handlers idempotent so retries do not create duplicate notifications.
- Track failures and retry within limits.
- Respect quiet hours, time zone, user preferences, and notification permissions.
- Provide a way to edit, snooze, or disable reminders.
- Avoid sending sensitive note content in push or email previews by default.

## 9. Analytics

Use deterministic application/database logic for metrics such as:
- Task completion counts over a date range.
- Habit completion rate with a clearly defined denominator.
- Days since a goal's last meaningful activity.
- Upcoming and overdue commitments.
- Planned versus completed work, if time estimates and records support it.

Keep metric definitions centralized and tested. Do not ask an LLM to calculate authoritative counts when code can calculate them.

## 10. Intelligence service boundary

The future intelligence module should accept a bounded, typed request and return a validated response.

Conceptual interface:

```ts
type ReviewContext = {
  periodStart: string;
  periodEnd: string;
  goals: GoalSummary[];
  taskSummary: TaskSummary;
  habitSummary: HabitSummary[];
  userPreferences: ReviewPreferences;
  relevantMemories: MemorySummary[];
};

type ReviewResult = {
  highlights: Insight[];
  risks: Insight[];
  questions: string[];
  suggestedAdjustments: SuggestedAdjustment[];
  uncertaintyNotes: string[];
};
```

Types are illustrative and should be adapted to the real codebase.

The intelligence layer must:
- Retrieve only context relevant to the task.
- Avoid passing secrets or unrelated private content.
- Validate output against a schema.
- Treat recommendations as suggestions, not commands.
- Never perform consequential actions directly from free-form model text.
- Have timeout, failure, retry, and usage-limit behavior.
- Be optional, observable, and replaceable.

## 11. Reliability and observability

- Record structured operational logs without sensitive payloads.
- Track request failures, background job failures, and AI provider failures.
- Use request IDs or trace IDs to investigate issues. Implemented in chunk 0.12: pino with field redaction, a request ID per request from the proxy, shown to users with unexpected errors, and `/api/health` (see the README, "Logging and errors").
- Add rate limits to authentication and expensive operations.
- Establish database backups and test restoration before relying on the app for important records. Production backups, point-in-time recovery and restore steps: [DEPLOY.md](DEPLOY.md).
- Define retention and deletion behavior for logs and backups.
- Use feature flags or configuration to disable unstable AI functionality.

## 12. Environments and configuration

Use separate development, test, and production configuration. Keep secrets outside version control.

Maintain `.env.example` with variable names and safe placeholder values. Never commit real credentials.

Document:
- Required environment variables.
- Database migration commands.
- Local setup.
- Test, lint, type-check, and build commands.
- Deployment and rollback procedure.
- Backup and restore procedure.

## 13. Scaling strategy

Do not begin with microservices. Scale in this order:

1. Reliable domain model and queries.
2. Indexes and query optimization based on evidence.
3. Managed database capacity and connection pooling.
4. Background jobs for slow or scheduled work.
5. Caching where measurements justify it.
6. Separate services only when deployment, reliability, or team boundaries require them.

## 14. Architecture decision records

For major choices, add a short record under `docs/decisions/` describing:
- Context and problem.
- Decision.
- Alternatives considered.
- Consequences and migration implications.
- Date and status.

Records live in [docs/decisions/](decisions/README.md).
