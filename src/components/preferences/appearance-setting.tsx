"use client";

import { useState, useSyncExternalStore } from "react";
import { ConnectedButtonGroup } from "@/components/ui/button-group";
import { InlineBanner } from "@/components/ui/inline-banner";
import { readThemeChoice, saveThemeChoice } from "@/lib/theme";

const choices = [
  { value: "system", label: "System", icon: "contrast" },
  { value: "light", label: "Light", icon: "light_mode" },
  { value: "dark", label: "Dark", icon: "dark_mode" },
] as const;

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributeFilter: ["data-theme", "data-theme-system"],
  });
  return () => observer.disconnect();
}

function useThemeChoice() {
  return useSyncExternalStore(subscribe, readThemeChoice, () => null);
}

export function AppearanceSummary() {
  const choice = useThemeChoice();
  return (
    choices.find(({ value }) => value === choice)?.label ??
    "Checking this device…"
  );
}

export function AppearanceSetting() {
  const current = useThemeChoice();
  const [storageFailed, setStorageFailed] = useState(false);

  return (
    <div className="grid gap-4">
      <div
        aria-hidden="true"
        className="grid grid-cols-2 gap-3 rounded-xl bg-canvas p-3 ring-1 ring-outline-variant"
      >
        <div className="col-span-2 grid gap-2 rounded-lg bg-resting-surface p-3 ring-1 ring-outline-variant">
          <div className="h-2 w-1/3 rounded-full bg-on-resting-surface" />
          <div className="h-2 w-2/3 rounded-full bg-outline-variant" />
        </div>
        <div className="flex min-h-9 items-center rounded-full bg-secondary-container px-3 text-label-medium text-on-secondary-container">
          Selected
        </div>
        <div className="flex min-h-9 items-center rounded-full bg-primary px-3 text-label-medium text-on-primary">
          Primary
        </div>
      </div>
      <div className="grid gap-2">
        <ConnectedButtonGroup
          label="Color theme"
          items={choices}
          value={current ?? "light"}
          size="xs"
          onValueChange={(value) => {
            const next = choices.find((item) => item.value === value)?.value;
            if (!next) return;
            setStorageFailed(!saveThemeChoice(next));
          }}
        />
        {storageFailed ? (
          <InlineBanner tone="warning" title="Theme couldn't be saved">
            This theme is active for this visit. Allow browser storage to keep
            it after reloading.
          </InlineBanner>
        ) : (
          <p className="text-body-medium text-on-surface-variant">
            Saved on this device.
          </p>
        )}
      </div>
    </div>
  );
}
