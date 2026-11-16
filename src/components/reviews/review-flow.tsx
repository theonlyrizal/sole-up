"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { Icon } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { InlineBanner } from "@/components/ui/inline-banner";
import { SaveStatus } from "@/components/ui/save-status";
import type { LocalDate } from "@/lib/dates";
import {
  adjacentReviewStep,
  REVIEW_STEP_LABELS,
  REVIEW_STEPS,
  reviewHref,
  type ReviewStep,
} from "@/lib/review-flow";
import { finishWeeklyReview } from "@/server/modules/weekly-reviews/actions";

import { ReviewFinishSheet } from "./review-finish-sheet";

type StepSave = () => Promise<boolean>;
type StepDraft = { save: StepSave; dirty: boolean };

const StepSaveContext = createContext<{
  register: (registration: StepDraft) => () => void;
  retry: () => void;
  pending: boolean;
} | null>(null);

/** Register the current step's draft and how to save it before leaving. */
export function useStepSave(save: StepSave, dirty: boolean) {
  const context = useContext(StepSaveContext);
  const register = context?.register;
  useEffect(() => register?.({ save, dirty }), [register, save, dirty]);
  return context;
}

export function ReviewFlow({
  reviewId,
  week,
  step,
  finished,
  editableUntil,
  children,
}: {
  reviewId: string;
  week: LocalDate;
  step: ReviewStep;
  finished: boolean;
  editableUntil: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const draft = useRef<StepDraft | null>(null);
  const register = useCallback((registration: StepDraft) => {
    draft.current = registration;
    return () => {
      if (draft.current === registration) draft.current = null;
    };
  }, []);
  const heading = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(step);
  const running = useRef(false);
  const actionButton = useRef<HTMLButtonElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [celebrating, setCelebrating] = useState(false);
  const [justFinished, setJustFinished] = useState(false);
  const [savedAgain, setSavedAgain] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    heading.current?.focus();
  }, [step]);

  function saveThen(next?: () => void | Promise<void>) {
    if (running.current || pending) return;
    running.current = true;
    startTransition(async () => {
      setError(null);
      setSavedAgain(false);
      try {
        if (draft.current && !(await draft.current.save())) {
          heading.current?.focus();
          return;
        }
        await next?.();
      } catch {
        setError("Changes couldn't be saved. Try again.");
      } finally {
        running.current = false;
      }
    });
  }

  // The shell and review menus use links too. Save before following a
  // same-tab app link, including links outside the review's component tree.
  useEffect(() => {
    function onLinkClick(event: MouseEvent) {
      if (
        (!draft.current?.dirty && !running.current && !pending) ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;

      const anchor = (event.target as Element | null)?.closest?.("a[href]");
      if (
        !(anchor instanceof HTMLAnchorElement) ||
        (anchor.target && anchor.target !== "_self") ||
        anchor.hasAttribute("download") ||
        anchor.getAttribute("aria-current") === "step"
      )
        return;

      const url = new URL(anchor.href);
      if (
        url.origin !== location.origin ||
        (url.pathname === location.pathname && url.search === location.search)
      )
        return;

      event.preventDefault();
      const sameWeek =
        url.pathname === "/review" && url.searchParams.get("week") === week;
      saveThen(() =>
        router.push(url.pathname + url.search + url.hash, {
          scroll: !sameWeek,
        }),
      );
    }

    document.addEventListener("click", onLinkClick, true);
    return () => document.removeEventListener("click", onLinkClick, true);
  });

  const index = REVIEW_STEPS.indexOf(step);
  const previous = adjacentReviewStep(step, -1);
  const next = adjacentReviewStep(step, 1);
  const isFinished = finished || justFinished;

  function goTo(target: ReviewStep) {
    saveThen(() => router.push(reviewHref(week, target), { scroll: false }));
  }

  function finish() {
    if (running.current || pending) return;
    // A direct link can omit the week. Keep the displayed period selected
    // when the action refreshes and the default changes after Finish.
    if (new URLSearchParams(location.search).get("week") !== week) {
      window.history.replaceState(null, "", reviewHref(week, step));
    }
    saveThen(async () => {
      const result = await finishWeeklyReview({ id: reviewId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      if (isFinished) {
        setSavedAgain(true);
        return;
      }
      setJustFinished(true);
      setCelebrating(true);
    });
  }

  return (
    <StepSaveContext value={{ register, retry: () => saveThen(), pending }}>
      <div className="grid min-w-0 gap-5 expanded:grid-cols-10 expanded:items-start expanded:gap-6">
        <div className="grid gap-2 expanded:hidden">
          <p className="text-label-large text-on-surface-variant">
            Step {index + 1} of {REVIEW_STEPS.length} ·{" "}
            {REVIEW_STEP_LABELS[step]}
          </p>
          <div aria-hidden="true" className="grid grid-cols-4 gap-1.5">
            {REVIEW_STEPS.map((item, itemIndex) => (
              <span
                key={item}
                className={cx(
                  "h-2 rounded-full",
                  itemIndex <= index ? "bg-primary" : "bg-progress-track",
                )}
              />
            ))}
          </div>
        </div>
        <nav
          aria-label="Review steps"
          className="hidden expanded:sticky expanded:top-4 expanded:col-span-3 expanded:block"
        >
          <ol className="grid gap-1">
            {REVIEW_STEPS.map((item, itemIndex) => (
              <li key={item}>
                <Link
                  href={reviewHref(week, item)}
                  prefetch={false}
                  scroll={false}
                  aria-current={item === step ? "step" : undefined}
                  onNavigate={(event) => {
                    if (item === step) event.preventDefault();
                  }}
                  className={cx(
                    "state-layer flex min-h-12 min-w-0 items-center gap-3 rounded-lg px-3 py-2 text-label-large wrap-anywhere",
                    focusRing,
                    item === step
                      ? "bg-primary-container text-on-primary-container"
                      : "text-on-surface-variant",
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cx(
                      "grid size-8 shrink-0 place-items-center rounded-full text-label-large tabular-nums",
                      item === step
                        ? "bg-primary text-on-primary"
                        : "border border-outline",
                    )}
                  >
                    {itemIndex < index ? (
                      <Icon name="check" size={18} />
                    ) : (
                      itemIndex + 1
                    )}
                  </span>
                  {REVIEW_STEP_LABELS[item]}
                </Link>
              </li>
            ))}
          </ol>
        </nav>

        <section
          aria-labelledby="review-step-heading"
          className="grid min-w-0 gap-4 expanded:col-span-7"
        >
          <h2
            id="review-step-heading"
            ref={heading}
            tabIndex={-1}
            className={cx("w-fit rounded-xs text-headline-small", focusRing)}
          >
            {REVIEW_STEP_LABELS[step]}
          </h2>
          <fieldset disabled={pending} className="min-w-0">
            {children}
          </fieldset>
          <div className="sticky bottom-[var(--compact-bottom-clearance,0px)] z-10 -mx-4 grid gap-2 border-t border-outline-variant bg-canvas px-4 py-2 medium:mx-0 medium:px-0 expanded:static">
            {error && <InlineBanner tone="error">{error}</InlineBanner>}
            {savedAgain && <SaveStatus phase="saved" />}
            <div className="flex flex-wrap justify-between gap-2">
              {previous && (
                <Button
                  variant="tonal"
                  disabled={pending}
                  onClick={() => goTo(previous)}
                >
                  Back
                </Button>
              )}
              <Button
                ref={actionButton}
                className="ms-auto"
                pending={pending}
                onClick={next ? () => goTo(next) : finish}
              >
                {next
                  ? `Next: ${REVIEW_STEP_LABELS[next]}`
                  : isFinished
                    ? "Save review"
                    : "Finish review"}
              </Button>
            </div>
          </div>
        </section>
      </div>
      <ReviewFinishSheet
        open={celebrating}
        editableUntil={editableUntil}
        onOpenChange={setCelebrating}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (actionButton.current?.disabled
            ? heading.current
            : actionButton.current
          )?.focus();
        }}
      />
    </StepSaveContext>
  );
}
