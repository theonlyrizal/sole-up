import Link from "next/link";
import { Suspense } from "react";

import { Icon, type IconName } from "@/components/icons/icon";
import { buttonClass } from "@/components/ui/button";
import { SHAPES } from "@/components/ui/shapes";
import { getSignedInAccount } from "@/server/auth/session";

const features = [
  {
    icon: "flag",
    title: "Goals → Today",
    detail: "Turn what matters into a next step.",
  },
  {
    icon: "task_alt",
    title: "Habits counted kindly",
    detail: "See what you did and pick up where you left off.",
  },
  {
    icon: "history",
    title: "Weekly review",
    detail: "Look back and choose what to carry forward.",
  },
] as const satisfies readonly {
  icon: IconName;
  title: string;
  detail: string;
}[];

export default function HomePage() {
  return (
    <div className="header-wash mx-auto flex w-full max-w-6xl flex-1 flex-col px-5 medium:px-10">
      <header className="rond-title-large-emphasized py-6 text-center text-title-large-emphasized text-primary expanded:text-start">
        SoleUp
      </header>
      <main
        id="main"
        className="grid flex-1 content-center gap-6 pt-5 pb-10 medium:gap-10"
      >
        <div className="grid items-center gap-5 expanded:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          <div className="grid justify-items-center gap-5 text-center expanded:justify-items-start expanded:text-start">
            <h1 className="rond-display-small expanded:rond-display-large max-w-full text-display-small text-balance wrap-anywhere expanded:text-display-large">
              Decide what matters. Plan what&apos;s realistic. See how it went.
            </h1>
            <div className="min-h-14">
              <Suspense
                fallback={
                  <span className="sr-only" role="status">
                    Checking sign-in…
                  </span>
                }
              >
                <LandingAction />
              </Suspense>
            </div>
          </div>
          <svg
            aria-hidden="true"
            focusable="false"
            viewBox="0 0 460 320"
            className="mx-auto w-full max-w-64 expanded:max-w-none"
          >
            <path
              d={SHAPES["cookie-9"]}
              transform="translate(23 47) scale(2.53)"
              className="fill-primary-container"
            />
            <path
              d={SHAPES["soft-burst"]}
              transform="translate(253 135) scale(1.62)"
              className="fill-tertiary-container"
            />
            <path
              d={SHAPES["clover-4"]}
              transform="translate(256 17) rotate(12 53 53) scale(1.16)"
              className="fill-secondary-container"
            />
          </svg>
        </div>

        <ul
          aria-label="What you can do"
          className="grid gap-1 medium:grid-cols-3"
        >
          {features.map(({ icon, title, detail }) => (
            <li
              key={title}
              className="flex min-w-0 items-start gap-3 rounded-xl bg-resting-surface p-4 text-on-resting-surface"
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary-container text-on-secondary-container">
                <Icon name={icon} size={20} />
              </span>
              <div className="grid min-w-0 gap-1 wrap-anywhere">
                <h2 className="text-title-medium">{title}</h2>
                <p className="text-body-medium text-on-surface-variant">
                  {detail}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </main>
      <footer className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-t border-outline-variant py-5 text-body-medium text-on-surface-variant expanded:justify-start">
        <span className="inline-flex items-center gap-2">
          <Icon name="lock" size={18} />
          Your data stays yours.
        </span>
        <Link
          href="/privacy"
          className={buttonClass({ variant: "text", size: "xs" })}
        >
          Privacy notes
        </Link>
      </footer>
    </div>
  );
}

async function LandingAction() {
  const account = await getSignedInAccount();
  const active = account?.status === "active";
  const label = active
    ? "Go to Home"
    : account?.status === "recoverable"
      ? "Reactivate account"
      : "Sign in";

  return (
    <Link
      href={active ? "/home" : "/sign-in"}
      className={buttonClass({ size: "m" })}
    >
      {label}
    </Link>
  );
}
