"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import { Button } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { toast } from "@/components/ui/toast";
import type { LocalDate } from "@/lib/dates";
import {
  adjacentReviewStep,
  REVIEW_STEP_LABELS,
  REVIEW_STEPS,
  reviewHref,
  type ReviewStep,
} from "@/lib/review-flow";
import { finishWeeklyReview } from "@/server/modules/weekly-reviews/actions";

/**
 * Saves a step's unsaved changes. Resolves false when the save failed; the
 * step shows why, and the flow stays on it.
 */
type StepSave = () => Promise<boolean>;

const StepSaveContext = createContext<React.RefObject<StepSave | null> | null>(
  null,
);

/**
 * Registers how the current step saves. The flow calls it whenever the
 * user leaves the step (another step, Back, Next, Finish), so each step
 * saves as it is left and the review can be resumed (chunk 7.3).
 */
export function useStepSave(save: StepSave) {
  const ref = useContext(StepSaveContext);
  useEffect(() => {
    if (!ref) return;
    ref.current = save;
    return () => {
      if (ref.current === save) ref.current = null;
    };
  });
}

type ReviewFlowProps = {
  reviewId: string;
  week: LocalDate;
  step: ReviewStep;
  finished: boolean;
  children: React.ReactNode;
};

/**
 * The four steps of an open review: a list of the steps (each one a link),
 * the current step's content, and Back / Next, with "Finish review" on the
 * last. Nothing has to be filled in to move on or to finish.
 */
export function ReviewFlow({
  reviewId,
  week,
  step,
  finished,
  children,
}: ReviewFlowProps) {
  const router = useRouter();
  const save = useRef<StepSave | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const shownStep = useRef(step);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // After moving to another step, focus its heading, so keyboard and
  // screen reader users start at the new step rather than the old button.
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    heading.current?.focus();
  }, [step]);

  const saveStep = async () => (save.current ? save.current() : true);

  function goTo(target: ReviewStep) {
    startTransition(async () => {
      setError(null);
      if (!(await saveStep())) return;
      router.push(reviewHref(week, target));
    });
  }

  function finish() {
    startTransition(async () => {
      setError(null);
      if (!(await saveStep())) return;
      const result = await finishWeeklyReview({ id: reviewId });
      if (result.ok) {
        toast({
          title: finished ? "Review saved" : "Review finished",
          variant: "success",
        });
      } else {
        setError(result.error.message);
      }
    });
  }

  const index = REVIEW_STEPS.indexOf(step);
  const previous = adjacentReviewStep(step, -1);
  const next = adjacentReviewStep(step, 1);

  return (
    <StepSaveContext value={save}>
      <div className="flex flex-col gap-6">
        <nav aria-label="Review steps">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {REVIEW_STEPS.map((item, itemIndex) => (
              <li key={item} className="flex">
                <a
                  href={reviewHref(week, item)}
                  aria-current={item === step ? "step" : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    if (item !== step && !pending) goTo(item);
                  }}
                  className={cx(
                    "flex flex-1 flex-col rounded-md border px-3 py-2 text-sm",
                    focusRing,
                    item === step
                      ? "border-fg bg-surface-muted font-semibold"
                      : "border-border text-muted hover:bg-surface-muted hover:text-fg",
                  )}
                >
                  <span className="text-xs">Step {itemIndex + 1}</span>
                  {REVIEW_STEP_LABELS[item]}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <section
          aria-labelledby="review-step-heading"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted">
              Step {index + 1} of {REVIEW_STEPS.length}
            </p>
            <h2
              id="review-step-heading"
              ref={heading}
              tabIndex={-1}
              className={cx("rounded-sm text-xl font-semibold", focusRing)}
            >
              {REVIEW_STEP_LABELS[step]}
            </h2>
          </div>
          {children}
        </section>

        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <p role="alert" className="text-sm text-danger empty:hidden">
            {error}
          </p>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {previous ? (
              <Button
                variant="secondary"
                disabled={pending}
                onClick={() => goTo(previous)}
              >
                Back
              </Button>
            ) : (
              <span />
            )}
            {next ? (
              <Button disabled={pending} onClick={() => goTo(next)}>
                Next: {REVIEW_STEP_LABELS[next]}
              </Button>
            ) : (
              <Button disabled={pending} onClick={finish}>
                {finished ? "Save review" : "Finish review"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </StepSaveContext>
  );
}
