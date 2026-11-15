"use client";

import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";

import { PageFrame } from "@/components/shell/page-frame";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Disclosure } from "@/components/ui/disclosure";
import { EmptyState } from "@/components/ui/empty-state";
import { IconButton } from "@/components/ui/icon-button";
import { ListGroup, ListItem } from "@/components/ui/list";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
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
import { LifeAreaForm } from "./life-area-form";
import { StarterLifeAreasOffer } from "./starter-life-areas-offer";

type Direction = "up" | "down";

export function LifeAreasManager({ view }: { view: LifeAreasView }) {
  const [active, setOptimisticActive] = useOptimistic(view.active);
  const [create, setCreate] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const list = useRef<HTMLDivElement>(null);
  const newArea = useRef<HTMLButtonElement>(null);
  const focusTarget = useRef<string | null>(null);

  useEffect(() => {
    if (!focusTarget.current || pending) return;
    const target = list.current?.querySelector<HTMLElement>(
      `[data-focus="${focusTarget.current}"]:not(:disabled)`,
    );
    if (target) target.focus();
    else if (document.activeElement === document.body) newArea.current?.focus();
    focusTarget.current = null;
  }, [pending, active, view.archived]);

  function run(
    action: () => Promise<ActionResult<unknown>>,
    success?: string,
    before?: () => void,
  ) {
    if (pending) return;
    startTransition(async () => {
      setError(null);
      before?.();
      try {
        const result = await action();
        if (!result.ok) setError(result.error.message);
        else if (success) toast({ title: success, variant: "success" });
      } catch {
        setError("Couldn't save the change. Try again.");
      }
    });
  }

  function move(index: number, direction: Direction) {
    const target = direction === "up" ? index - 1 : index + 1;
    const next = [...active];
    [next[index], next[target]] = [next[target]!, next[index]!];
    const moved = active[index]!;
    const other = direction === "up" ? "down" : "up";
    const atEnd = target === 0 || target === next.length - 1;
    focusTarget.current = `${moved.id}:${atEnd ? other : direction}`;
    run(
      async () => {
        const result = await reorderLifeAreas({
          ids: next.map((area) => area.id),
        });
        if (!result.ok) focusTarget.current = `${moved.id}:${direction}`;
        return result;
      },
      undefined,
      () => setOptimisticActive(next),
    );
  }

  return (
    <PageFrame
      width="detail"
      title="Life areas"
      back={{ href: "/goals", label: "Goals" }}
      actions={
        <LifeAreaForm
          open={create}
          onOpenChange={setCreate}
          trigger={<Button ref={newArea}>New area</Button>}
        />
      }
    >
      <div ref={list} className="grid gap-5">
        {view.offerStarters && <StarterLifeAreasOffer />}
        {error && (
          <p role="alert" className="text-body-medium text-error">
            {error}
          </p>
        )}
        <section aria-labelledby="active-areas" className="grid gap-3">
          <h2 id="active-areas" className="text-title-large">
            Active
          </h2>
          {active.length === 0 ? (
            <EmptyState
              headingLevel={3}
              title="No life areas yet"
              description="Add the parts of your life you want to keep in balance, like Health or Career. Goals can belong to an area."
              compact
            />
          ) : (
            <ListGroup label="Active life areas">
              {active.map((area, index) => (
                <AreaRow
                  key={area.id}
                  area={area}
                  fallbackFocus={() => newArea.current?.focus()}
                  archive={() => {
                    focusTarget.current = `${area.id}:menu`;
                    run(() => archiveLifeArea({ id: area.id }), "Archived");
                  }}
                  reorder={
                    <>
                      <IconButton
                        icon="arrow_upward"
                        label={`Move ${area.name} up`}
                        data-focus={`${area.id}:up`}
                        disabled={pending || index === 0}
                        onClick={() => move(index, "up")}
                      />
                      <IconButton
                        icon="arrow_downward"
                        label={`Move ${area.name} down`}
                        data-focus={`${area.id}:down`}
                        disabled={pending || index === active.length - 1}
                        onClick={() => move(index, "down")}
                      />
                    </>
                  }
                  pending={pending}
                />
              ))}
            </ListGroup>
          )}
        </section>

        {view.archived.length > 0 && (
          <Disclosure
            title={`Archived (${view.archived.length})`}
            open={showArchived}
            onOpenChange={setShowArchived}
          >
            <ListGroup label="Archived life areas">
              {view.archived.map((area) => (
                <AreaRow
                  key={area.id}
                  area={area}
                  fallbackFocus={() => newArea.current?.focus()}
                  pending={pending}
                  restore={() => {
                    focusTarget.current = `${area.id}:menu`;
                    run(() => unarchiveLifeArea({ id: area.id }), "Restored");
                  }}
                />
              ))}
            </ListGroup>
          </Disclosure>
        )}
      </div>
    </PageFrame>
  );
}

function AreaRow({
  area,
  reorder,
  pending,
  archive,
  restore,
  fallbackFocus,
}: {
  area: LifeArea;
  reorder?: React.ReactNode;
  pending: boolean;
  archive?: () => void;
  restore?: () => void;
  fallbackFocus: () => void;
}) {
  const [dialog, setDialog] = useState<"edit" | "delete" | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const openingDialog = useRef(false);
  const deleted = useRef(false);

  function openDialog(kind: "edit" | "delete") {
    openingDialog.current = true;
    setDialog(kind);
  }

  function restoreFocus(event: Event) {
    event.preventDefault();
    if (deleted.current || !trigger.current) fallbackFocus();
    else trigger.current.focus();
  }

  return (
    <ListItem
      className="gap-2 px-2 medium:gap-4 medium:px-4"
      wrapActions
      leading={<ColorSwatch color={area.color} size={16} />}
      headline={<span className="text-title-medium">{area.name}</span>}
      supporting={area.description}
      wrapSupporting
      trailing={
        <div className="flex flex-wrap items-center justify-end">
          {reorder}
          {restore && (
            <Button
              variant="tonal"
              size="xs"
              aria-label={`Restore ${area.name}`}
              onClick={restore}
              disabled={pending}
            >
              Restore
            </Button>
          )}
          <Menu modal={false}>
            <MenuTrigger asChild>
              <IconButton
                ref={trigger}
                icon="more_vert"
                label={`Actions for ${area.name}`}
                data-focus={`${area.id}:menu`}
                tooltip={false}
              />
            </MenuTrigger>
            <MenuContent
              align="end"
              onCloseAutoFocus={(event) => {
                if (openingDialog.current) event.preventDefault();
                openingDialog.current = false;
              }}
            >
              {archive && (
                <>
                  <MenuItem icon="edit" onSelect={() => openDialog("edit")}>
                    Edit
                  </MenuItem>
                  <MenuItem
                    icon="archive"
                    disabled={pending}
                    onSelect={archive}
                  >
                    Archive
                  </MenuItem>
                </>
              )}
              <MenuItem
                icon="delete"
                destructive
                onSelect={() => openDialog("delete")}
              >
                Delete…
              </MenuItem>
            </MenuContent>
          </Menu>
          {archive && (
            <LifeAreaForm
              area={area}
              open={dialog === "edit"}
              onOpenChange={(open) => setDialog(open ? "edit" : null)}
              onCloseAutoFocus={restoreFocus}
            />
          )}
          <ConfirmDialog
            open={dialog === "delete"}
            onOpenChange={(open) => setDialog(open ? "delete" : null)}
            onCloseAutoFocus={restoreFocus}
            title={`Delete “${area.name}”?`}
            description="This permanently deletes the area and its history. Its goals are kept and move to No area. It can't be undone. To keep it out of the way instead, archive it."
            confirmLabel="Delete area"
            onConfirm={async () => {
              const result = await deleteLifeArea({ id: area.id });
              if (result.ok) {
                deleted.current = true;
                toast({ title: "Area deleted", variant: "success" });
              }
              return result;
            }}
          />
        </div>
      }
    />
  );
}
