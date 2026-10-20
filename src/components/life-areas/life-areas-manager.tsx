"use client";

import {
  useEffect,
  useId,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import type { LifeArea } from "@/lib/life-areas";
import type { ActionResult } from "@/lib/result";
import {
  archiveLifeArea,
  deleteLifeArea,
  reorderLifeAreas,
  unarchiveLifeArea,
} from "@/server/modules/life-areas/actions";
import type { LifeAreasView } from "@/server/modules/life-areas/queries";

import { ColorSwatch } from "./life-area-colors";
import { CreateLifeAreaForm, EditLifeAreaForm } from "./life-area-form";
import { StarterLifeAreasOffer } from "./starter-life-areas-offer";

type Direction = "up" | "down";

export function LifeAreasManager({ view }: { view: LifeAreasView }) {
  const archivedListId = useId();
  const [active, setOptimisticActive] = useOptimistic(view.active);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  // Where focus goes once a row action re-renders the list.
  const focusTarget = useRef<string | null>(null);

  useEffect(() => {
    if (!focusTarget.current || pending) return;
    listRef.current
      ?.querySelector<HTMLElement>(
        `[data-focus="${focusTarget.current}"]:not(:disabled)`,
      )
      ?.focus();
    focusTarget.current = null;
  }, [pending, active, editingId]);

  /** Runs a row action; shows its error above the list. */
  function run(
    action: () => Promise<ActionResult<unknown>>,
    success?: string,
    before?: () => void,
  ) {
    startTransition(async () => {
      setError(null);
      before?.();
      const result = await action();
      if (!result.ok) setError(result.error.message);
      else if (success) toast({ title: success, variant: "success" });
    });
  }

  function move(index: number, direction: Direction) {
    const target = direction === "up" ? index - 1 : index + 1;
    const next = [...active];
    [next[index], next[target]] = [next[target]!, next[index]!];
    const moved = active[index]!;
    // Keep focus on the pressed button, or its partner at either end.
    const other = direction === "up" ? "down" : "up";
    const atEnd = target === 0 || target === next.length - 1;
    focusTarget.current = `${moved.id}:${atEnd ? other : direction}`;
    run(
      () => reorderLifeAreas({ ids: next.map((area) => area.id) }),
      undefined,
      () => setOptimisticActive(next),
    );
  }

  return (
    <div ref={listRef} className="flex flex-col gap-6">
      {view.offerStarters && <StarterLifeAreasOffer />}

      <p role="alert" className="text-sm text-danger empty:hidden">
        {error}
      </p>

      <section aria-labelledby="active-areas" className="flex flex-col gap-4">
        <h2 id="active-areas" className="text-lg font-semibold">
          Active
        </h2>
        {active.length === 0 ? (
          <EmptyState
            headingLevel={3}
            title="No life areas yet"
            description="Add the parts of your life you want to keep in balance, like Health or Career. Goals can belong to an area."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface">
            {active.map((area, index) => (
              <li key={area.id} className="p-3">
                {editingId === area.id ? (
                  <EditLifeAreaForm
                    area={area}
                    onDone={() => {
                      setEditingId(null);
                      focusTarget.current = `${area.id}:edit`;
                    }}
                  >
                    <DeleteAreaButton area={area} />
                  </EditLifeAreaForm>
                ) : (
                  <AreaSummary area={area}>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Move ${area.name} up`}
                      data-focus={`${area.id}:up`}
                      disabled={pending || index === 0}
                      onClick={() => move(index, "up")}
                    >
                      <Arrow direction="up" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Move ${area.name} down`}
                      data-focus={`${area.id}:down`}
                      disabled={pending || index === active.length - 1}
                      onClick={() => move(index, "down")}
                    >
                      <Arrow direction="down" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Edit ${area.name}`}
                      data-focus={`${area.id}:edit`}
                      onClick={() => setEditingId(area.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      aria-label={`Archive ${area.name}`}
                      disabled={pending}
                      onClick={() =>
                        run(() => archiveLifeArea({ id: area.id }), "Archived")
                      }
                    >
                      Archive
                    </Button>
                  </AreaSummary>
                )}
              </li>
            ))}
          </ul>
        )}
        <CreateLifeAreaForm />
      </section>

      {view.archived.length > 0 && (
        <section aria-label="Archived" className="flex flex-col gap-4">
          <div>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={showArchived}
              aria-controls={archivedListId}
              onClick={() => setShowArchived((shown) => !shown)}
            >
              {showArchived ? "Hide" : "Show"} archived ({view.archived.length})
            </Button>
          </div>
          <ul
            id={archivedListId}
            hidden={!showArchived}
            className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface"
          >
            {view.archived.map((area) => (
              <li key={area.id} className="p-3">
                <AreaSummary area={area} muted>
                  <Button
                    variant="secondary"
                    size="sm"
                    aria-label={`Restore ${area.name}`}
                    disabled={pending}
                    onClick={() =>
                      run(() => unarchiveLifeArea({ id: area.id }), "Restored")
                    }
                  >
                    Restore
                  </Button>
                  <DeleteAreaButton area={area} />
                </AreaSummary>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AreaSummary({
  area,
  muted,
  children,
}: {
  area: LifeArea;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <ColorSwatch color={area.color} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={muted ? "text-muted" : "font-medium"}>
          {area.name}
        </span>
        {area.description && (
          <span className="text-sm break-words text-muted">
            {area.description}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1">{children}</div>
    </div>
  );
}

function DeleteAreaButton({ area }: { area: LifeArea }) {
  return (
    <ConfirmDialog
      trigger={
        <Button variant="danger" size="sm" aria-label={`Delete ${area.name}`}>
          Delete
        </Button>
      }
      title={`Delete “${area.name}”?`}
      description="This permanently deletes the area and its history. It can't be undone. To keep it out of the way instead, archive it."
      confirmLabel="Delete area"
      onConfirm={async () => {
        const result = await deleteLifeArea({ id: area.id });
        if (result.ok) toast({ title: "Area deleted", variant: "success" });
        return result;
      }}
    />
  );
}

function Arrow({ direction }: { direction: Direction }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      className="size-4"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={direction === "up" ? "M5 12l5-5 5 5" : "M5 8l5 5 5-5"} />
    </svg>
  );
}
