import Link from "next/link";
import { cx, focusRing } from "@/components/ui/cx";

export function StatNumber({
  value,
  unit,
  href,
  feature,
}: {
  value: number;
  unit: string;
  href?: string;
  feature?: boolean;
}) {
  const className = cx(
    "flex flex-wrap items-baseline gap-x-2 text-title-medium wrap-anywhere",
    !feature && "text-on-surface-variant",
    href && "min-h-12 w-fit rounded-sm hover:underline",
    href && focusRing,
  );
  const figure = (
    <>
      <span className="text-display-small text-current tabular-nums medium:text-display-medium">
        {value}
      </span>{" "}
      <span>{unit}</span>
    </>
  );
  return href ? (
    <Link className={className} href={href}>
      {figure}
    </Link>
  ) : (
    <p className={className}>{figure}</p>
  );
}
