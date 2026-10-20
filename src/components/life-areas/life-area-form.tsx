"use client";

import { useId, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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

/** Inline form that adds an area by name. */
export function CreateLifeAreaForm() {
  const id = useId();
  const [name, setName] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await createLifeArea({ name });
      if (result.ok) {
        setName("");
        setError(null);
        toast({ title: "Area added", variant: "success" });
      } else {
        setError(result.error);
      }
    });
  }

  const fieldErrors = error?.code === "VALIDATION" ? error.fieldErrors : {};
  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label="New life area"
      className="flex flex-col gap-2"
    >
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <FormField
            id={`${id}-name`}
            label="New area"
            errors={fieldErrors.name}
          >
            {(control) => (
              <Input
                {...control}
                name="name"
                value={name}
                maxLength={LIFE_AREA_NAME_MAX}
                autoComplete="off"
                placeholder="e.g. Health"
                onChange={(event) => setName(event.target.value)}
              />
            )}
          </FormField>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </div>
      <FormError error={error} />
    </form>
  );
}

type EditProps = {
  area: LifeArea;
  onDone: () => void;
  /** Extra controls in the footer, such as Delete. */
  children?: React.ReactNode;
};

/** Inline editor for one area. Escape cancels. */
export function EditLifeAreaForm({ area, onDone, children }: EditProps) {
  const id = useId();
  const [name, setName] = useState(area.name);
  const [description, setDescription] = useState(area.description ?? "");
  const [color, setColor] = useState<LifeAreaColor | "">(area.color ?? "");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await updateLifeArea({
        id: area.id,
        name,
        description,
        color: color || null,
      });
      if (result.ok) {
        toast({ title: "Area saved", variant: "success" });
        onDone();
      } else {
        setError(result.error);
      }
    });
  }

  const fieldErrors = error?.code === "VALIDATION" ? error.fieldErrors : {};
  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !pending) onDone();
      }}
      noValidate
      aria-label={`Edit ${area.name}`}
      className="flex flex-col gap-4"
    >
      <FormField id={`${id}-name`} label="Name" errors={fieldErrors.name}>
        {(control) => (
          <Input
            {...control}
            name="name"
            value={name}
            maxLength={LIFE_AREA_NAME_MAX}
            autoComplete="off"
            autoFocus
            onChange={(event) => setName(event.target.value)}
          />
        )}
      </FormField>
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
            value={description}
            maxLength={LIFE_AREA_DESCRIPTION_MAX}
            onChange={(event) => setDescription(event.target.value)}
          />
        )}
      </FormField>
      <FormField id={`${id}-color`} label="Color" errors={fieldErrors.color}>
        {(control) => (
          <Select
            {...control}
            name="color"
            value={color}
            onChange={(event) =>
              setColor(event.target.value as LifeAreaColor | "")
            }
          >
            <option value="">None</option>
            {LIFE_AREA_COLORS.map((value) => (
              <option key={value} value={value}>
                {colorLabel(value)}
              </option>
            ))}
          </Select>
        )}
      </FormField>
      <FormError error={error} />
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button
          variant="secondary"
          size="sm"
          disabled={pending}
          onClick={onDone}
        >
          Cancel
        </Button>
        <span className="flex-1" />
        {children}
      </div>
    </form>
  );
}

/** A failure that doesn't belong to one field. */
function FormError({ error }: { error: ActionError | null }) {
  if (!error) return null;
  const message =
    error.code === "VALIDATION"
      ? error.formErrors.join(" ") || null
      : error.message;
  return message ? (
    <p role="alert" className="text-sm text-danger">
      {message}
    </p>
  ) : null;
}
