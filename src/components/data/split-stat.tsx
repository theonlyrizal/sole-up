export function SplitStat({
  figures,
}: {
  figures: readonly [
    { value: number; label: string },
    { value: number; label: string },
  ];
}) {
  return (
    <dl className="grid grid-cols-2 divide-x divide-outline-variant rtl:divide-x-reverse">
      {figures.map(({ value, label }) => (
        <div
          key={label}
          className="flex min-w-0 flex-col-reverse items-start gap-1 px-3 first:ps-0 last:pe-0"
        >
          <dt className="text-body-medium wrap-anywhere text-on-surface-variant">
            {label}
          </dt>
          <dd className="text-display-small wrap-anywhere tabular-nums">
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
