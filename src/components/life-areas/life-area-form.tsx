"use client";

import { useId, useState, useTransition } from "react";

import { Icon } from "@/components/icons/icon";
import { FormDialog } from "@/components/ui/form-dialog";
import { FormError } from "@/components/ui/form-error";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioSwatch } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import {
  LIFE_AREA_COLORS,
  LIFE_AREA_DESCRIPTION_MAX,
  LIFE_AREA_NAME_MAX,
  type LifeArea,
  type LifeAreaColor,
} from "@/lib/life-areas";
import type { ActionError } from "@/lib/result";
import {
  createLifeArea,
  updateLifeArea,
} from "@/server/modules/life-areas/actions";

import { colorLabel } from "./life-area-colors";

const NO_COLOR = "none";

export function LifeAreaForm({
  area,
  open,
  onOpenChange,
  onCloseAutoFocus,
  trigger,
}: {
  area?: LifeArea;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCloseAutoFocus?: (event: Event) => void;
  trigger?: React.ReactElement;
}) {
  const id = useId();
  const [error, setError] = useState<ActionError | null>(null);
  const [transportError, setTransportError] = useState(false);
  const [pending, startTransition] = useTransition();

  function changeOpen(next: boolean) {
    if (pending) return;
    setError(null);
    setTransportError(false);
    onOpenChange(next);
  }

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const color = data.get("color") as LifeAreaColor | typeof NO_COLOR | null;
    const fields = {
      name: String(data.get("name") ?? ""),
      description: String(data.get("description") ?? ""),
      color: color === NO_COLOR ? null : color,
    };
    startTransition(async () => {
      setError(null);
      setTransportError(false);
      try {
        const result = area
          ? await updateLifeArea({ id: area.id, ...fields })
          : await createLifeArea(fields);
        if (result.ok) {
          toast({
            title: area ? "Area saved" : "Area added",
            variant: "success",
          });
          onOpenChange(false);
        } else {
          setError(result.error);
        }
      } catch {
        setTransportError(true);
      }
    });
  }

  const fieldErrors = error?.code === "VALIDATION" ? error.fieldErrors : {};
  const colorErrorId = fieldErrors.color?.length
    ? `${id}-color-error`
    : undefined;
  return (
    <FormDialog
      title={area ? "Edit life area" : "New life area"}
      open={open}
      onOpenChange={changeOpen}
      onCloseAutoFocus={onCloseAutoFocus}
      trigger={trigger}
      formId={id}
      pending={pending}
      submitLabel={area ? "Save" : "Add area"}
    >
      <form id={id} onSubmit={submit} noValidate className="grid gap-4">
        <FormField id={`${id}-name`} label="Name" errors={fieldErrors.name}>
          {(control) => (
            <Input
              {...control}
              name="name"
              defaultValue={area?.name}
              maxLength={LIFE_AREA_NAME_MAX}
              autoComplete="off"
              autoFocus
              placeholder="e.g. Health"
            />
          )}
        </FormField>
        <div className="grid gap-1">
          <p className="text-label-large">Colour</p>
          <RadioGroup
            label="Colour"
            name="color"
            defaultValue={area?.color ?? NO_COLOR}
            className="flex-row flex-wrap gap-1"
            aria-describedby={colorErrorId}
            aria-invalid={colorErrorId ? true : undefined}
          >
            {LIFE_AREA_COLORS.map((value) => (
              <RadioSwatch
                key={value}
                value={value}
                label={colorLabel(value)}
                style={{
                  backgroundColor: `var(--area-${value}-container)`,
                  color: `var(--area-${value}-on)`,
                }}
              />
            ))}
            <RadioSwatch value={NO_COLOR} label="No colour">
              <Icon name="block" size={20} />
            </RadioSwatch>
          </RadioGroup>
          {colorErrorId && (
            <p id={colorErrorId} className="text-body-small text-error">
              {fieldErrors.color?.join(" ")}
            </p>
          )}
        </div>
        <FormField
          id={`${id}-description`}
          label="Description"
          hint="Optional. What this area covers for you."
          errors={fieldErrors.description}
        >
          {(control) => (
            <Textarea
              {...control}
              name="description"
              rows={2}
              defaultValue={area?.description ?? ""}
              maxLength={LIFE_AREA_DESCRIPTION_MAX}
            />
          )}
        </FormField>
        <FormError error={error} />
        {transportError && (
          <p role="alert" className="text-body-medium text-error">
            Couldn&apos;t save the area. Try again.
          </p>
        )}
      </form>
    </FormDialog>
  );
}
