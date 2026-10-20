/** Props a FormField hands to its control. Spread them onto it. */
export type FieldControlProps = {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
};

type FormFieldProps = {
  /** The control's id. Use `useId()` for a unique one. */
  id: string;
  label: string;
  hint?: React.ReactNode;
  /** Validation messages; any message marks the field invalid. */
  errors?: string[];
  children: (control: FieldControlProps) => React.ReactNode;
};

/**
 * A label, a control, an optional hint and validation errors, wired
 * together: the label targets the control, and the hint and errors are
 * linked with `aria-describedby`.
 *
 * ```tsx
 * <FormField id={id} label="Title" errors={fieldErrors.title}>
 *   {(control) => <Input {...control} name="title" />}
 * </FormField>
 * ```
 */
export function FormField({
  id,
  label,
  hint,
  errors,
  children,
}: FormFieldProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = errors?.length ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": errorId ? true : undefined,
      })}
      {hint && (
        <p id={hintId} className="text-sm text-muted">
          {hint}
        </p>
      )}
      {errorId && (
        <p id={errorId} className="text-sm text-danger">
          {errors!.join(" ")}
        </p>
      )}
    </div>
  );
}
