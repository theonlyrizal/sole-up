import { Icon } from "@/components/icons/icon";

/** Props a FormField hands to its control. Spread them onto it. */
export type FieldControlProps = {
  id: string;
  "aria-describedby": string | undefined;
  "aria-invalid": true | undefined;
};

type FormFieldProps = {
  /** The control's id. Use useId() for a unique one. */
  id: string;
  label: string;
  hint?: React.ReactNode;
  errors?: string[];
  children: (control: FieldControlProps) => React.ReactNode;
};

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
    <div className="flex min-w-0 flex-col gap-1">
      <div className="filled-field" data-invalid={errorId ? true : undefined}>
        <label htmlFor={id} className="block text-label-medium wrap-anywhere">
          {label}
        </label>
        {children({
          id,
          "aria-describedby": describedBy,
          "aria-invalid": errorId ? true : undefined,
        })}
        {errorId && (
          <Icon name="error" size={20} className="field-error-icon" />
        )}
      </div>
      {hint && (
        <p id={hintId} className="text-body-small text-on-surface-variant">
          {hint}
        </p>
      )}
      {errorId && (
        <p id={errorId} className="text-body-small text-error">
          {errors?.join(" ")}
        </p>
      )}
    </div>
  );
}
