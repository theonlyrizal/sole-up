import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy · SoleUp" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10 text-sm leading-relaxed">
      <header className="flex flex-col gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Privacy notes</h1>
        <p className="text-muted">
          Updated <time dateTime="2026-11-08">8 November 2026</time>. These
          notes describe the current implementation and documented deployment.
          They do not certify the live host settings.
        </p>
      </header>

      <section aria-labelledby="stored-heading" className="flex flex-col gap-3">
        <h2 id="stored-heading" className="text-lg font-semibold">
          What is stored
        </h2>
        <ul className="list-disc space-y-3 pl-5">
          <li>
            Your name, email, verification status, profile-image URL and linked
            Google or GitHub account identifiers. Authentication can store
            provider tokens, scopes and expiry times, session tokens, IP
            addresses, browser user-agent strings and temporary verification
            values. SoleUp uses provider sign-in, with no password sign-in of
            its own.
          </li>
          <li>
            Your life areas, goals and reasons, milestones, tasks, notes, dates,
            calendar events and recurrence exceptions, time blocks, habits,
            schedules, pauses and logs, weekly reviews and priorities, tags,
            links and insight dismissals. Notes are stored as editor JSON,
            derived plain text and a database search index. Search runs in
            PostgreSQL.
          </li>
          <li>
            Time zone, locale, week start, onboarding choices, reminder and
            quiet-hour settings, push endpoints and keys, device labels and
            delivery results. Reminder records include schedules, delivery state
            and error codes. Closure records include recovery or closure times.
          </li>
          <li>
            Activity history with account/entity IDs, event types, timestamps
            and allowed structured changes, such as statuses, dates and links.
            Audit events exclude titles, note bodies, goal reasons and review
            reflections. This history is separate from operational logs.
          </li>
        </ul>
        <p>
          Browser cookies support sign-in and the short-lived
          account-verification proof used for closure.
        </p>
      </section>

      <section
        aria-labelledby="hosting-heading"
        className="flex flex-col gap-3"
      >
        <h2 id="hosting-heading" className="text-lg font-semibold">
          Hosting and other services
        </h2>
        <p>
          The documented deployment uses Render Free for the web app in
          Singapore and Neon Free for PostgreSQL in AWS Singapore
          (ap-southeast-1). This does not promise that every provider&apos;s
          logs, backups or support systems stay in that region.
        </p>
        <p>
          Deployment instructions use HTTPS and certificate-verified database
          connections. Storage relies on{" "}
          <a
            href="https://neon.com/docs/security/security-overview#data-at-rest-encryption"
            className="text-accent underline underline-offset-4"
          >
            Neon&apos;s provider-managed encryption at rest
          </a>
          . SoleUp does not add field-level or end-to-end encryption to stored
          personal content. The app and people with authorized database access
          can read it.
        </p>
        <p>
          Google or GitHub handles sign-in. Enabled notifications use encrypted
          Web Push through your browser&apos;s push service. Notifications can
          show task or event titles; private mode in Settings → Reminders omits
          those titles, while times, links and reminder identifiers still travel
          with them. Signing out does not remove the push subscription. Turn
          notifications off in Settings → Notifications on a shared device.
        </p>
        <p>
          The documented cron-job.org scheduler stores the app URL, sweep
          credential and execution history with aggregate counts and timing,
          rather than task or note content. These services have their own data
          handling and retention outside SoleUp&apos;s application controls.
        </p>
      </section>

      <section
        aria-labelledby="deletion-heading"
        className="flex flex-col gap-3"
      >
        <h2 id="deletion-heading" className="text-lg font-semibold">
          Retention, deletion and account closure
        </h2>
        <p>
          Archiving keeps records for restoration. Item deletion removes the
          selected live database record and its associated audit events through
          that feature&apos;s deletion flow. Related records can remain:
          deleting a goal keeps its tasks, habits and linked notes, removing
          their goal relationship where applicable. Deleting a note removes it
          and its links.
        </p>
        <p>
          <strong>
            Settings → Delete account currently closes access; it does not erase
            your data.
          </strong>{" "}
          After linked-provider verification and typed confirmation, closure
          revokes existing sessions and suspends app access, exports and new
          push sends through account-status checks. Sign in through a linked
          provider within 30 days to explicitly reactivate. Retained device
          subscriptions can resume after reactivation.
        </p>
        <p>
          Reactivation stops at the deadline even if the sweep is late. The
          sweep moves the request to a closed-account registry and revokes
          recovery sessions. Your account, content, history, linked-provider
          records and device subscriptions remain in the database. There is no
          implemented automatic purge or fixed retention period for retained
          closed accounts. The 30 days are a recovery window, not an erasure
          deadline.
        </p>
        <p>
          Neither item deletion nor closure removes backups, host logs,
          downloaded exports or notifications already sent or displayed.
          Requests or sends already in progress may finish. The service worker
          has no offline page/data cache, but closure cannot remotely erase an
          open browser page or copies saved elsewhere.
        </p>
        <p>
          While your account is active, Settings → Export downloads JSON with a
          Markdown copy of each note. Tokens and push endpoints/keys are
          excluded, but personal content and session metadata are included.
          Export before closing your account and keep the download private.
        </p>
      </section>

      <section
        aria-labelledby="backups-heading"
        className="flex flex-col gap-3"
      >
        <h2 id="backups-heading" className="text-lg font-semibold">
          Backups
        </h2>
        <p>
          <strong>Host/database backup retention is unconfirmed.</strong> No
          expiry date for backup copies after deletion or closure is promised.
        </p>
        <p>
          Deployment instructions describe a six-hour Neon Free point-in-time
          recovery window and recommend weekly manual database dumps and dumps
          before risky migrations. That recovery window does not confirm the
          live setting or the provider&apos;s underlying backup retention. Dumps
          contain all users&apos; data. Instructions call for encrypted storage
          and removal of old dumps, but there is no specified retention schedule
          or automated dump cleanup. Restore branches and other copies also need
          operator handling. Restoring an older copy can bring back deleted
          records or earlier account-access state.
        </p>
      </section>

      <section aria-labelledby="logs-heading" className="flex flex-col gap-3">
        <h2 id="logs-heading" className="text-lg font-semibold">
          Logs and their retention
        </h2>
        <p>
          App logs go to standard output, viewed in Render. They can include
          request IDs, timestamps, HTTP methods, paths without query strings in
          request-error logs, error classes/codes, stack frames, error digests
          and aggregate sweep outcomes and durations. Record IDs may appear in
          paths.
        </p>
        <p>
          The configured logger redacts sensitive field names and serializes
          errors without their messages; the authentication logger also filters
          details. These protections do not guarantee that all framework,
          authentication or hosting output is free of personal data. Framework
          error output can bypass the app logger.
        </p>
        <p>
          There is no configured external app-log shipper or application-managed
          log expiry. Render retention depends on the workspace plan; the live
          duration is unconfirmed. Provider and cron execution logs have their
          own retention. Database audit history has no age-based cleanup, and
          account closure retains it.
        </p>
      </section>

      <section aria-labelledby="ai-heading" className="flex flex-col gap-3">
        <h2 id="ai-heading" className="text-lg font-semibold">
          No AI processing yet
        </h2>
        <p>
          The current app has no AI/LLM processing or model-training
          integration. Search uses PostgreSQL; summaries and insights use
          deterministic queries and calculations. This implementation does not
          send personal content to an AI provider. Future AI features need an
          updated explanation of their data use.
        </p>
      </section>

      <nav aria-label="Privacy navigation" className="flex flex-wrap gap-6">
        <Link
          href="/settings"
          className="text-accent underline underline-offset-4"
        >
          Settings
        </Link>
        <Link
          href="/sign-in"
          className="text-accent underline underline-offset-4"
        >
          Sign in
        </Link>
      </nav>
    </main>
  );
}
