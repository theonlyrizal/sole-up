import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Icon } from "@/components/icons/icon";
import { buttonClass } from "@/components/ui/button";
import { ACCOUNT_RECOVERY_DAYS } from "@/lib/account-deletion";

export const metadata: Metadata = {
  title: "Privacy Policy · SoleUp",
  description:
    "Understand what SoleUp keeps, how your information is used, and the choices available to you.",
};

const topics = [
  ["stored-heading", "What you share"],
  ["use-heading", "Making SoleUp useful"],
  ["hosting-heading", "Caring for your information"],
  ["reminders-heading", "Your reminders"],
  ["deletion-heading", "Your choices"],
  ["backups-heading", "Storage and recovery"],
  ["logs-heading", "Keeping things working"],
  ["updates-heading", "Keeping you informed"],
] as const;

const textLink = "text-primary underline underline-offset-4";

function PolicyContents() {
  return (
    <nav aria-label="Explore the privacy policy" className="grid gap-4">
      <p className="hidden text-label-large text-on-surface-variant expanded:block">
        Explore the policy
      </p>
      <ol className="grid gap-1 medium:max-expanded:grid-cols-2">
        {topics.map(([id, label], index) => (
          <li key={id}>
            <a
              href={`#${id}`}
              className="flex min-h-12 items-center gap-3 rounded-xl px-3 py-2 text-body-medium hover:bg-surface-container focus-visible:bg-surface-container"
            >
              <span
                aria-hidden="true"
                className="text-label-medium text-primary"
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              {label}
            </a>
          </li>
        ))}
      </ol>
      <p className="hidden border-t border-outline-variant pt-4 text-body-small text-on-surface-variant expanded:block">
        Make yourself at home. Explore the topics that matter to you.
      </p>
    </nav>
  );
}

function PolicySection({
  id,
  number,
  title,
  summary,
  children,
}: {
  id: string;
  number: string;
  title: string;
  summary: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="grid gap-5 border-t border-outline-variant pt-8"
    >
      <div className="grid gap-3">
        <span aria-hidden="true" className="text-label-large text-primary">
          {number}
        </span>
        <h2 id={id} className="scroll-mt-8 text-headline-small text-balance">
          {title}
        </h2>
        <div className="text-body-large leading-relaxed">{summary}</div>
      </div>
      <div className="divide-y divide-outline-variant rounded-2xl border border-outline-variant bg-resting-surface px-5 text-on-resting-surface medium:px-6">
        {children}
      </div>
    </section>
  );
}

function MoreDetail({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <details className="group">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-title-small [&::-webkit-details-marker]:hidden">
        {title}
        <Icon
          name="expand_more"
          size={20}
          className="shrink-0 group-open:rotate-180"
        />
      </summary>
      <div className="grid gap-3 pb-5 text-body-medium leading-relaxed text-on-surface-variant">
        {children}
      </div>
    </details>
  );
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto w-full max-w-6xl flex-1 px-5 medium:px-10">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant py-5">
        <Link
          href="/"
          className="rond-title-large-emphasized text-title-large-emphasized text-primary"
        >
          SoleUp
        </Link>
        <Link
          href="/settings"
          className={buttonClass({ variant: "tonal", size: "xs" })}
        >
          Your settings
        </Link>
      </header>

      <main
        id="main"
        className="grid items-start gap-10 py-8 medium:py-12 expanded:grid-cols-[13rem_minmax(0,1fr)] expanded:gap-12"
      >
        <aside className="hidden expanded:sticky expanded:top-8 expanded:block">
          <PolicyContents />
        </aside>

        <article className="grid min-w-0 gap-10">
          <header className="relative overflow-hidden rounded-3xl bg-primary-container p-6 text-on-primary-container medium:p-8">
            <div
              aria-hidden="true"
              className="absolute -top-8 -right-8 grid size-36 place-items-center rounded-full bg-secondary-container text-on-secondary-container medium:size-44"
            >
              <Icon name="lock" size={44} />
            </div>
            <div className="relative grid gap-5">
              <p className="pr-24 text-label-large">
                Your privacy matters to us.
              </p>
              <h1 className="rond-display-small max-w-80 text-display-small text-balance medium:text-display-medium">
                Privacy Policy
              </h1>
              <p className="max-w-lg text-body-large leading-relaxed">
                Your plans are personal. We want you to feel informed about what
                you share and how SoleUp handles it.
              </p>
              <p className="text-body-small">
                Updated <time dateTime="2026-11-23">23 November 2026</time>
              </p>
            </div>
          </header>

          <details className="group rounded-2xl border border-outline-variant px-5 expanded:hidden">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 text-title-small [&::-webkit-details-marker]:hidden">
              Explore the policy
              <Icon
                name="expand_more"
                size={20}
                className="shrink-0 group-open:rotate-180"
              />
            </summary>
            <div className="pb-4">
              <PolicyContents />
            </div>
          </details>
          <section aria-labelledby="overview-heading" className="grid gap-4">
            <h2 id="overview-heading" className="text-title-large">
              A quick overview
            </h2>
            <ul className="grid gap-4 text-body-medium leading-relaxed">
              <li className="grid gap-1">
                <strong className="text-title-small">
                  You choose what to share
                </strong>
                <p className="text-on-surface-variant">
                  Your plans, account details and preferences help SoleUp
                  provide the features you use.
                </p>
              </li>
              <li className="grid gap-1">
                <strong className="text-title-small">
                  Protecting your information
                </strong>
                <p className="text-on-surface-variant">
                  Sign-in checks protect account access. Authorized operators
                  can read stored content.
                </p>
              </li>
              <li className="grid gap-1">
                <strong className="text-title-small">
                  Closing your account
                </strong>
                <p className="text-on-surface-variant">
                  Access closes with a {ACCOUNT_RECOVERY_DAYS}-day recovery
                  window. Stored data remains after closure.
                </p>
              </li>
            </ul>
            <p className="text-body-small text-on-surface-variant">
              Explore any section below to learn more about your information and
              choices.
            </p>
          </section>

          <PolicySection
            id="stored-heading"
            number="01"
            title="A little information helps your plans take shape"
            summary={
              <p>
                SoleUp gives you a place to bring your plans together. What we
                keep depends on what you add and which features you use.
              </p>
            }
          >
            <MoreDetail title="Getting to know your account">
              <p>
                Google or GitHub helps you sign in. We keep the account details
                they provide, including your name, email, verification status,
                profile-picture link and linked account identifier. You do not
                create a separate SoleUp password.
              </p>
              <p>
                Sign-in also creates records that help keep your session
                working, such as provider credentials, permissions, expiry
                dates, IP addresses, browser details and temporary verification
                information. Cookies support sign-in and identity checks.
              </p>
            </MoreDetail>
            <MoreDetail title="The things you choose to add">
              <p>
                Your goals, tasks, notes, calendar plans, habits and weekly
                reflections give your planner its meaning. We store these along
                with the dates, schedules, check-ins, priorities, tags and
                connections you add.
              </p>
              <p>
                Notes include formatting and a searchable text copy. Preferences
                such as your time zone, week start, quiet hours and reminder
                choices help everything fit your day.
              </p>
            </MoreDetail>
            <MoreDetail title="A record of how things change">
              <p>
                Activity history keeps item and account identifiers, times, and
                selected changes such as dates, status and links. It leaves out
                titles, note text, goal reasons and weekly reflections.
              </p>
              <p>
                Enabled notifications add a browser delivery address, security
                keys, device label and delivery results. Reminder and
                account-closure records keep their schedules, status and
                relevant dates.
              </p>
            </MoreDetail>
          </PolicySection>

          <PolicySection
            id="use-heading"
            number="02"
            title="Helping you make room for what matters"
            summary={
              <p>
                Your information helps turn a collection of plans into a useful
                daily companion, from finding a thought you saved to looking
                back on your progress.
              </p>
            }
          >
            <MoreDetail title="Supporting your everyday planning">
              <p>
                We use your information to save and organize your plans, keep
                you signed in, search your notes, calculate progress and deliver
                reminders. Your dates and preferences help put things in the
                right place and at the right time.
              </p>
              <p>
                Service records help us investigate problems and keep these
                features working.
              </p>
            </MoreDetail>
            <MoreDetail title="How search and insights work">
              <p id="ai-heading">
                Search and insights use stored information and set calculations.
                The current app does not send personal content to an AI provider
                or use a model-training integration.
              </p>
              <p>
                Any future AI feature will need its own explanation of how it
                uses information.
              </p>
            </MoreDetail>
          </PolicySection>

          <PolicySection
            id="hosting-heading"
            number="03"
            title="Taking care of the information you entrust to us"
            summary={
              <p>
                Trust matters when your planner holds parts of your everyday
                life. Sign-in checks limit account access, and other services
                help SoleUp store and deliver your information.
              </p>
            }
          >
            <MoreDetail title="Protecting access to your information">
              <p>
                The documented setup uses encrypted connections and the database
                provider&apos;s storage encryption. Stored content is readable
                by SoleUp and people with authorized database access; it is not
                end-to-end encrypted or separately encrypted field by field.
              </p>
              <p>
                The hosting plan uses Render and Neon in Singapore. Live
                settings are not confirmed here, and provider logs, backups or
                support systems may operate elsewhere.
              </p>
            </MoreDetail>
            <MoreDetail title="The services that help us provide SoleUp">
              <p>
                Render hosts the app, Neon stores its database, and Google or
                GitHub supports sign-in. Your browser&apos;s push service
                carries encrypted reminders when you enable notifications.
              </p>
              <p>
                The documented reminder scheduler, cron-job.org, keeps the app
                address, a credential, execution history, timing and overall
                results, rather than your task or note content.
              </p>
              <p>
                Each provider has its own data handling and retention practices.
                SoleUp&apos;s settings do not erase copies held by those
                providers.
              </p>
            </MoreDetail>
          </PolicySection>

          <PolicySection
            id="reminders-heading"
            number="04"
            title="Reminders that fit your day"
            summary={
              <p>
                A timely nudge can help you return to what matters. You choose
                your reminder preferences; notifications can display task or
                event titles on your device.
              </p>
            }
          >
            <MoreDetail title="Choosing a little more privacy">
              <p>
                Private mode in{" "}
                <Link href="/settings#reminders" className={textLink}>
                  Settings → Reminders
                </Link>{" "}
                replaces task and event titles with a general reminder. Times,
                links and reminder identifiers still travel with it.
                Notifications leave out notes, descriptions, locations and goal
                reasons.
              </p>
            </MoreDetail>
            <MoreDetail title="Making choices for each device">
              <p>
                On a shared device, turn notifications off in{" "}
                <Link href="/settings#notifications" className={textLink}>
                  Settings → Notifications
                </Link>
                . Signing out does not remove that browser&apos;s notification
                subscription.
              </p>
              <p>
                Closing your account stops new sends through account checks.
                Sends already in progress may finish, and delivered
                notifications cannot be recalled. Subscriptions remain stored
                and can resume after reactivation.
              </p>
            </MoreDetail>
          </PolicySection>

          <PolicySection
            id="deletion-heading"
            number="05"
            title="Your information, your choices"
            summary={
              <p>
                Plans change, and your planner should leave room for that. You
                can edit your information, remove individual items, download a
                copy or close account access.
              </p>
            }
          >
            <MoreDetail title="Making changes along the way">
              <p>
                Edit information where you added it, or archive an item to keep
                it for later. Deleting an item removes its live record and
                associated activity history through that feature.
              </p>
              <p>
                Related items can remain. Deleting a goal keeps its tasks,
                habits and linked notes, removing their goal connection where
                applicable. Deleting a note removes the note and its links.
              </p>
            </MoreDetail>
            <MoreDetail title="Taking a copy with you">
              <p>
                Export in{" "}
                <Link href="/settings#account" className={textLink}>
                  Settings → Account
                </Link>{" "}
                downloads your data as JSON, including a Markdown copy of each
                note. Personal content and session details are included; sign-in
                credentials and notification delivery addresses and keys are
                excluded.
              </p>
              <p>
                Export while your account is active, before closing it. Keep the
                file somewhere private, because SoleUp cannot manage copies you
                save elsewhere.
              </p>
            </MoreDetail>
            <MoreDetail title="When you decide to close your account">
              <p>
                The current “Delete account” option closes access rather than
                erasing stored information. After provider verification and
                typed confirmation, existing sessions end and app access,
                exports and new notification sends are suspended.
              </p>
              <p>
                You have {ACCOUNT_RECOVERY_DAYS} days to sign in with a linked
                provider and choose to reactivate. Recovery ends at the
                deadline, even if the background closure check runs later.
              </p>
              <p>
                Your account, content, history, linked sign-in records and
                device subscriptions stay stored after closure. There is no
                automatic purge or fixed retention period. The recovery window
                is not a deletion deadline.
              </p>
            </MoreDetail>
          </PolicySection>

          <PolicySection
            id="backups-heading"
            number="06"
            title="Keeping your plans available"
            summary={
              <p>
                Having your plans there when you return is part of making SoleUp
                useful. Information stays stored for the features you use, and
                closed-account data currently remains stored too.
              </p>
            }
          >
            <MoreDetail title="Backups and recovery copies">
              <p>
                Backup and hosting-log retention is unconfirmed, so there is no
                promised date when every copy disappears. The deployment guide
                describes a six-hour recovery window and recommends manual
                backups; that does not confirm live retention.
              </p>
              <p>
                Manual backups contain all users&apos; data. The guide calls for
                encrypted storage and removal of old copies, but cleanup is not
                automatic and has no set schedule. Restoring a backup can bring
                back deleted records or earlier account-access settings.
              </p>
            </MoreDetail>
            <MoreDetail title="Information already saved elsewhere">
              <p>
                Item deletion and account closure do not remove existing
                backups, host logs, exports or delivered notifications. Requests
                already in progress may finish.
              </p>
              <p>
                SoleUp&apos;s background browser worker does not keep an offline
                page or data cache. Open browser pages and copies saved
                elsewhere still cannot be remotely erased.
              </p>
            </MoreDetail>
          </PolicySection>

          <PolicySection
            id="logs-heading"
            number="07"
            title="Keeping SoleUp working for you"
            summary={
              <p>
                When something goes wrong, service records help us understand
                what happened. These sit alongside the activity history that
                supports your planner.
              </p>
            }
          >
            <MoreDetail title="Understanding and resolving problems">
              <p>
                Service logs can include request identifiers, times, paths,
                error details and overall reminder results. Paths may contain
                item identifiers. The app&apos;s request-error logs leave out
                address query details.
              </p>
              <p>
                Our logging filters sensitive fields and omits error messages
                from its own error records. Framework, sign-in or host output
                can fall outside those filters, so logs may still contain
                personal information.
              </p>
            </MoreDetail>
            <MoreDetail title="How service records are kept">
              <p>
                The app has no separate log-forwarding service or automatic log
                expiry. Providers set their own retention, and live hosting-log
                duration is unconfirmed.
              </p>
              <p>
                Database activity history has no age-based cleanup and remains
                after account closure.
              </p>
            </MoreDetail>
          </PolicySection>

          <PolicySection
            id="updates-heading"
            number="08"
            title="Keeping you informed"
            summary={
              <p>
                We want this page to be somewhere you can return to when you
                have a question. It is available without an account, with your
                privacy choices linked throughout.
              </p>
            }
          >
            <MoreDetail title="About this policy">
              <p>
                This explanation covers the current app and its documented
                hosting setup, rather than confirming every live provider
                setting. The date at the top shows its last update.
              </p>
              <p>
                Changes to features or information handling will need to be
                reflected here. Visit Settings whenever you want to review the
                choices available to you.
              </p>
            </MoreDetail>
          </PolicySection>

          <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-outline-variant pt-6 text-body-medium">
            <Link
              href="/settings"
              className={buttonClass({ variant: "tonal", size: "xs" })}
            >
              Manage your settings
            </Link>
            <Link href="/sign-in" className={textLink}>
              Sign in to SoleUp
            </Link>
          </footer>
        </article>
      </main>
    </div>
  );
}
