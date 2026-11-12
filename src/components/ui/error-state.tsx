import Link from "next/link";
import { Button, buttonClass } from "./button";
import { EmptyState } from "./empty-state";

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
  return (
    <div role="alert">
      <EmptyState
        title={title}
        description={description}
        headingLevel={headingLevel}
        art={{ icon: "error", tone: "error" }}
        action={
          <>
            {onRetry && (
              <Button variant="tonal" onClick={onRetry}>
                Try again
              </Button>
            )}
            <Link href="/home" className={buttonClass({ variant: "text" })}>
              Go home
            </Link>
          </>
        }
      />
    </div>
  );
}
