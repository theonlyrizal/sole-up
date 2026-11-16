"use client";

import { createContext } from "react";
import type { WeekStart } from "@/lib/dates";
import { DEFAULT_LOCALE } from "@/lib/preferences";

type Preferences = {
  locale: string;
  timeZone: string;
  weekStart: WeekStart;
};

export const PickerPreferences = createContext<Preferences>({
  locale: DEFAULT_LOCALE,
  timeZone: "UTC",
  weekStart: 0,
});

export function PickerPreferencesProvider({
  value,
  children,
}: {
  value: Preferences;
  children: React.ReactNode;
}) {
  return (
    <PickerPreferences.Provider value={value}>
      {children}
    </PickerPreferences.Provider>
  );
}
