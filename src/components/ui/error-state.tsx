import { Button } from "./button";

type ErrorStateProps = {
  title?: string;
  /** User-safe text. Never pass an error's own message. */
  description?: React.ReactNode;
  /** Shows a "Try again" button that calls this. */
  onRetry?: () => void;
  headingLevel?: 1 | 2 | 3;
};

/** Shown when something failed to load or save. */
export function ErrorState({
  title = "Something went wrong",
  description = "Your data is safe. Try again, and if it keeps happening, reload the page.",
  onRetry,
  headingLevel = 2,
}: ErrorStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-6"
    >
      <Heading className="text-lg font-semibold">{title}</Heading>
      <div className="text-muted">{description}</div>
      {onRetry && (
        <Button variant="secondary" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
