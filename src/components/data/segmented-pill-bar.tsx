export function SegmentedPillBar({
  value,
  total,
  label,
  max = 31,
}: {
  value: number;
  total: number;
  label: string;
  max?: number;
}) {
  if (total <= 0) return null;

  const segments = Math.min(Math.ceil(total), max);
  const unitsPerSegment = total > max ? total / segments : 1;
  return (
    <div role="img" aria-label={label} className="flex max-w-full gap-1">
      {Array.from({ length: segments }, (_, index) => {
        const fill = Math.max(0, Math.min(1, value / unitsPerSegment - index));
        return (
          <span
            key={index}
            className="flex h-10 w-1.5 min-w-0 items-end overflow-hidden rounded-full bg-progress-track"
          >
            <span
              className="w-full rounded-full bg-primary"
              style={{ height: `${fill * 100}%` }}
            />
          </span>
        );
      })}
    </div>
  );
}
