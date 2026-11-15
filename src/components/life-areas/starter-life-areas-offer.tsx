"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { AreaChip } from "@/components/data/area-chip";
import { Card } from "@/components/ui/card";
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
    <Card headingId={`${id}-title`} variant="tonal" className="grid gap-3">
      <h2 id={`${id}-title`} className="text-title-large">
        Start with some suggestions?
      </h2>
      <form onSubmit={accept} className="flex flex-col gap-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-body-medium text-on-surface-variant">
            Pick any that fit. You can rename, archive or delete them later.
          </legend>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {STARTER_LIFE_AREAS.map((name) => (
              <label
                key={name}
                className="flex min-h-12 cursor-pointer items-center gap-2"
              >
                <input
                  type="checkbox"
                  name="names"
                  value={name}
                  checked={chosen.includes(name)}
                  onChange={(event) => toggle(name, event.target.checked)}
                  className="size-5 shrink-0 accent-primary"
                />
                <AreaChip name={name} color={null} />
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
          <Button
            type="submit"
            disabled={pending || chosen.length === 0}
            aria-busy={pending || undefined}
          >
            {pending ? "Adding…" : "Add selected"}
          </Button>
          <Button variant="secondary" disabled={pending} onClick={dismiss}>
            No thanks
          </Button>
        </div>
      </form>
    </Card>
  );
}
