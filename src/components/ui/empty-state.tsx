type EmptyStateProps = {
  title: string;
  description?: React.ReactNode;
  /** A next step, such as a "New goal" button. */
  action?: React.ReactNode;
  /** Heading level, so the state fits the page outline. Defaults to 2. */
  headingLevel?: 2 | 3;
};

/** Shown when a list or page has nothing in it yet. */
export function EmptyState({
  title,
  description,
  action,
  headingLevel = 2,
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as const;
  return (
    <div className="flex flex-col items-start gap-3 rounded-lg border border-dashed border-border bg-surface p-6">
      <Heading className="text-lg font-semibold">{title}</Heading>
      {description && <div className="text-muted">{description}</div>}
      {action}
    </div>
  );
}
