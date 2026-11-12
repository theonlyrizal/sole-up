"use client";

import { ResponsiveSheet } from "@/components/ui/bottom-sheet";
import { IconButton } from "@/components/ui/icon-button";

export function MetricInfo({
  title,
  definition,
  range,
  asOf,
  asOfLabel,
}: {
  title: string;
  definition: string;
  range: string;
  asOf: string;
  asOfLabel: string;
}) {
  return (
    <ResponsiveSheet
      title="How this is counted"
      anchor={
        <IconButton icon="info" label={`How this is counted: ${title}`} />
      }
    >
      <p className="text-body-large">{definition}</p>
      <dl className="grid gap-1 text-body-medium text-on-surface-variant">
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-semibold">Range</dt>
          <dd>{range}</dd>
        </div>
        <div className="flex flex-wrap gap-x-2">
          <dt className="font-semibold">As of</dt>
          <dd>
            <time dateTime={asOf}>{asOfLabel}</time>
          </dd>
        </div>
      </dl>
    </ResponsiveSheet>
  );
}
