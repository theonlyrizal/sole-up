"use client";

import { useId, useState } from "react";

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
  const [errors, setErrors] = useState<Partial<Record<ReflectField, string[]>>>(
    {},
  );
  const [formError, setFormError] = useState<string | null>(null);

  useStepSave(async () => {
    const changed = FIELDS.filter(({ name }) => values[name] !== saved[name]);
    if (changed.length === 0) return true;
    setErrors({});
    setFormError(null);
    const result = await saveWeeklyReviewText({
      id: review.id,
      ...Object.fromEntries(changed.map(({ name }) => [name, values[name]])),
    });
    if (result.ok) {
      setSaved(values);
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
  });

  return (
    <form
      aria-label="Reflect"
      noValidate
      onSubmit={(event) => event.preventDefault()}
      className="flex flex-col gap-4"
    >
      <p className="text-muted">
        A few words are plenty, and every field can stay empty. Your notes are
        saved when you move to another step.
      </p>
      {FIELDS.map(({ name, label, hint }) => (
        <FormField
          key={name}
          id={`${id}-${name}`}
          label={label}
          hint={hint}
          errors={errors[name]}
        >
          {(control) => (
            <Textarea
              {...control}
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
      ))}
      <p role="alert" className="text-sm text-danger empty:hidden">
        {formError}
      </p>
    </form>
  );
}
