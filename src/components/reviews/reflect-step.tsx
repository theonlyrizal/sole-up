"use client";

import { useId, useState } from "react";

import { Card } from "@/components/ui/card";
import { SaveStatus } from "@/components/ui/save-status";
import { InlineBanner } from "@/components/ui/inline-banner";
import { FormField } from "@/components/ui/form-field";
import { Textarea } from "@/components/ui/textarea";
import { REVIEW_TEXT_MAX, type WeeklyReview } from "@/lib/weekly-reviews";
import { saveWeeklyReviewText } from "@/server/modules/weekly-reviews/actions";

import { useStepSave } from "./review-flow";

const FIELDS = [
  {
    name: "wins",
    label: "Wins",
    hint: "What went well, however small.",
  },
  {
    name: "blockers",
    label: "Blockers",
    hint: "What got in the way.",
  },
  {
    name: "lessons",
    label: "Lessons",
    hint: "Anything you'd do differently, or keep doing.",
  },
] as const;

type ReflectField = (typeof FIELDS)[number]["name"];
type Values = Record<ReflectField, string>;

const valuesOf = (review: WeeklyReview): Values => ({
  wins: review.wins ?? "",
  blockers: review.blockers ?? "",
  lessons: review.lessons ?? "",
});

/**
 * Reflect (chunk 7.3): wins, blockers and lessons, each optional. Saved when
 * the user leaves the step; only changed fields are sent.
 */
export function ReflectStep({ review }: { review: WeeklyReview }) {
  const id = useId();
  const [saved, setSaved] = useState(() => valuesOf(review));
  const [values, setValues] = useState(saved);
  const [hasSaved, setHasSaved] = useState(() =>
    Object.values(saved).some(Boolean),
  );
  const [errors, setErrors] = useState<Partial<Record<ReflectField, string[]>>>(
    {},
  );
  const [formError, setFormError] = useState<string | null>(null);

  const changed = FIELDS.filter(({ name }) => values[name] !== saved[name]);
  const saveState = useStepSave(async () => {
    setErrors({});
    setFormError(null);
    if (changed.length === 0) return true;
    const result = await saveWeeklyReviewText({
      id: review.id,
      ...Object.fromEntries(changed.map(({ name }) => [name, values[name]])),
    });
    if (result.ok) {
      setSaved(values);
      setHasSaved(true);
      return true;
    }
    const fieldErrors =
      result.error.code === "VALIDATION" ? result.error.fieldErrors : {};
    setErrors({
      wins: fieldErrors.wins,
      blockers: fieldErrors.blockers,
      lessons: fieldErrors.lessons,
    });
    setFormError(result.error.message);
    return false;
  }, changed.length > 0);

  return (
    <form
      aria-label="Reflect"
      noValidate
      onSubmit={(event) => event.preventDefault()}
      className="flex flex-col gap-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-body-large text-on-surface-variant">
          Everything here is optional.
        </p>
        {saveState?.pending && changed.length > 0 ? (
          <SaveStatus phase="saving" />
        ) : formError ? (
          <SaveStatus phase="error" onRetry={saveState?.retry} />
        ) : changed.length === 0 && hasSaved ? (
          <SaveStatus phase="saved" />
        ) : null}
      </div>
      {formError && <InlineBanner tone="error">{formError}</InlineBanner>}
      {FIELDS.map(({ name, label, hint }) => (
        <Card as="div" key={name}>
          <FormField
            id={`${id}-${name}`}
            label={label}
            hint={hint}
            errors={errors[name]}
          >
            {(control) => (
              <Textarea
                {...control}
                className="min-h-40!"
                name={name}
                maxLength={REVIEW_TEXT_MAX}
                value={values[name]}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [name]: event.target.value,
                  }))
                }
              />
            )}
          </FormField>
        </Card>
      ))}
    </form>
  );
}
