"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { cx, focusRing } from "@/components/ui/cx";
import { toast } from "@/components/ui/toast";
import { STARTER_LIFE_AREAS, type StarterLifeArea } from "@/lib/life-areas";
import {
  addStarterLifeAreas,
  dismissStarterLifeAreas,
} from "@/server/modules/life-areas/actions";

/**
 * Suggested areas, offered once to a user with none. Either answer hides
 * it for good; nothing is created unless the user asks.
 */
export function StarterLifeAreasOffer() {
  const id = useId();
  const [chosen, setChosen] = useState<StarterLifeArea[]>([
    ...STARTER_LIFE_AREAS,
  ]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function toggle(name: StarterLifeArea, checked: boolean) {
    setChosen((current) =>
      // Keep the suggested order whatever the click order.
      STARTER_LIFE_AREAS.filter((item) =>
        item === name ? checked : current.includes(item),
      ),
    );
  }

  function accept(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await addStarterLifeAreas({ names: chosen });
      if (result.ok) toast({ title: "Areas added", variant: "success" });
      else setError(result.error.message);
    });
  }

  function dismiss() {
    startTransition(async () => {
      const result = await dismissStarterLifeAreas({});
      if (!result.ok) setError(result.error.message);
    });
  }

  return (
    <section
      aria-labelledby={`${id}-title`}
      className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-5"
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold">
        Start with some suggestions?
      </h2>
      <form onSubmit={accept} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-muted">
            Pick any that fit. You can rename, archive or delete them later.
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {STARTER_LIFE_AREAS.map((name) => (
              <label key={name} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="names"
                  value={name}
                  checked={chosen.includes(name)}
                  onChange={(event) => toggle(name, event.target.checked)}
                  className={cx("size-4 accent-accent", focusRing)}
                />
                {name}
              </label>
            ))}
          </div>
        </fieldset>
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending || chosen.length === 0}>
            {pending ? "Adding…" : "Add selected"}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={dismiss}>
            No thanks
          </Button>
        </div>
      </form>
    </section>
  );
}
