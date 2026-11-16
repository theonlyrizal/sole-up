"use client";

import { useState, useSyncExternalStore } from "react";
import { ConnectedButtonGroup } from "@/components/ui/button-group";
import { InlineBanner } from "@/components/ui/inline-banner";
import {
  readThemeChoice,
  saveThemeChoice,
  type ThemeChoice,
} from "@/lib/theme";

const choices = [
  { value: "system", label: "System", icon: "contrast" },
  { value: "light", label: "Light", icon: "light_mode" },
  { value: "dark", label: "Dark", icon: "dark_mode" },
] as const;

const subscribe = () => () => {};
const serverChoice = () => "light" as const;

export function AppearanceSetting() {
  const applied = useSyncExternalStore(
    subscribe,
    readThemeChoice,
    serverChoice,
  );
  const [choice, setChoice] = useState<ThemeChoice>();
  const [storageFailed, setStorageFailed] = useState(false);
  const current = choice ?? applied;

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
          value={current}
          size="xs"
          onValueChange={(value) => {
            const next = choices.find((item) => item.value === value)?.value;
            if (!next) return;
            setStorageFailed(!saveThemeChoice(next));
            setChoice(next);
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
