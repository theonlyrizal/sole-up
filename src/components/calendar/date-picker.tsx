"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { ResponsiveSheet } from "@/components/ui/bottom-sheet";
import { Button } from "@/components/ui/button";
import type { LocalDate, WeekStart } from "@/lib/dates";
import { MonthGrid } from "./month-grid";

export function DatePicker({
  label,
  shortLabel,
  selected,
  today,
  locale,
  weekStart,
  href,
}: {
  label: string;
  shortLabel: string;
  selected: LocalDate;
  today: LocalDate;
  locale: string;
  weekStart: WeekStart;
  href: (date: LocalDate) => string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <ResponsiveSheet
      title="Go to date"
      anchor={
        <Button
          variant="text"
          size="xs"
          trailingIcon="expand_more"
          className="text-title-medium"
          aria-label={`Go to date, ${shortLabel}`}
          title={label}
        >
          {shortLabel}
        </Button>
      }
      open={open}
      onOpenChange={setOpen}
    >
      {open && (
        <MonthGrid
          selected={selected}
          today={today}
          locale={locale}
          weekStart={weekStart}
          onSelect={(date) => {
            setOpen(false);
            router.push(href(date));
          }}
        />
      )}
    </ResponsiveSheet>
  );
}
