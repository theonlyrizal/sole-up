import Link from "next/link";

import { buttonClass } from "./button";
import { EmptyState } from "./empty-state";

export function NotFoundState({
  description,
  href,
  label,
}: {
  description: string;
  href: string;
  label: string;
}) {
  return (
    <EmptyState
      className="mx-auto max-w-lg"
      title="We couldn't find that"
      headingLevel={1}
      description={description}
      art={{ shape: "arch", icon: "search" }}
      action={
        <Link href={href} className={buttonClass()}>
          {label}
        </Link>
      }
    />
  );
}
