"use client";

import { useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/icons/icon";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { ConnectedButtonGroup } from "@/components/ui/button-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { cx } from "@/components/ui/cx";
import { Fab, FabMenu } from "@/components/ui/fab";
import { FormField } from "@/components/ui/form-field";
import { IconButton, IconLink } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { NumberStepper } from "@/components/ui/number-stepper";
import { RadioGroup, RadioRow } from "@/components/ui/radio-group";
import { Select } from "@/components/ui/select";
import { ShapeAvatar } from "@/components/ui/shape-avatar";
import { Switch, SwitchRow } from "@/components/ui/switch";
import { Tabs } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useMediaQuery } from "@/components/hooks/use-media-query";

type Theme = "light" | "dark";
type View = "compare" | Theme;

const views = [
  { value: "compare", label: "Compare" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];
const buttonVariants = [
  ["filled", "Save"],
  ["tonal", "Schedule"],
  ["outlined", "Preview"],
  ["text", "Skip"],
  ["elevated", "Open"],
  ["danger", "Delete"],
  ["danger-text", "Remove"],
] as const satisfies readonly (readonly [ButtonVariant, string])[];
const iconVariants = [
  ["standard", "Search", "search"],
  ["filled", "Edit", "edit"],
  ["tonal", "Add note", "note_add"],
  ["outlined", "Filter", "filter_list"],
] as const satisfies readonly (readonly [
  "standard" | "filled" | "tonal" | "outlined",
  string,
  IconName,
])[];

export function Gallery() {
  const [view, setView] = useState<View>("compare");
  const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
  return (
    <main
      data-theme={view === "dark" ? "dark" : "light"}
      className="min-h-dvh bg-canvas px-4 pt-8 pb-12 text-on-surface medium:px-6 medium:pt-10"
    >
      <header className="mx-auto mb-8 flex max-w-7xl flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-headline-large">SoleUp component gallery</h1>
          <p className="mt-1 text-body-medium text-on-surface-variant">
            {reducedMotion ? "Reduced motion is on" : "Standard motion"} ·
            Actions, selection and fields
          </p>
        </div>
        <ConnectedButtonGroup
          label="Gallery appearance"
          value={view}
          items={views}
          onValueChange={(next) => setView(next as View)}
        />
      </header>
      <div
        className={cx(
          "mx-auto grid max-w-7xl items-start gap-4 medium:gap-6",
          view === "compare" && "expanded:grid-cols-2",
        )}
      >
        {view !== "dark" && <ThemeColumn theme="light" />}
        {view !== "light" && <ThemeColumn theme="dark" />}
      </div>
    </main>
  );
}

function Example({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid min-w-0 gap-3 rounded-lg bg-resting-surface p-4 text-on-resting-surface medium:p-6">
      <h3 className="text-title-medium-emphasized">{title}</h3>
      {children}
    </section>
  );
}

const row = "flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1";

function ThemeColumn({ theme }: { theme: Theme }) {
  const title = theme === "light" ? "Light" : "Dark";
  const [range, setRange] = useState("week");
  const [filter, setFilter] = useState(false);
  const [chip, setChip] = useState(true);
  const [star, setStar] = useState(false);
  const [lastAction, setLastAction] = useState("");
  const anchor = `#${theme}-fields`;

  return (
    <section
      data-theme={theme}
      aria-labelledby={`${theme}-theme`}
      className="grid min-w-0 gap-4 rounded-xl border border-outline-variant bg-canvas p-3 text-on-surface medium:p-4"
    >
      <h2 id={`${theme}-theme`} className="px-1 text-title-large-emphasized">
        {title}
      </h2>
      <Example title="Icon and shape avatar">
        <div className={row}>
          <Icon name="flag" size={18} />
          <Icon name="flag" size={20} filled />
          <Icon name="calendar_month" size={24} />
          <Icon name="check_circle" size={32} filled />
          <Icon name="note_add" size={40} />
        </div>
        <div className={row}>
          <ShapeAvatar
            id="rina"
            label="Rina"
            entityType="user"
            shape="cookie-9"
            size={32}
          />
          <ShapeAvatar
            id="mornings"
            label="Read in the morning"
            entityType="habit"
            size={40}
          />
          <ShapeAvatar
            id="mornings"
            label="Morning reading"
            entityType="habit"
            size={48}
          />
          <ShapeAvatar
            id="journey"
            label="Écrire tous les jours"
            entityType="goal"
            area="violet"
            size={56}
          />
          <ShapeAvatar
            id="walk"
            label="Walk after lunch"
            entityType="habit"
            size={72}
          />
        </div>
      </Example>
      <Example title="Button">
        <div className={row}>
          {buttonVariants.map(([variant, label]) => (
            <Button key={variant} variant={variant}>
              {label}
            </Button>
          ))}
        </div>
        <div className={row}>
          <Button size="xs" variant="outlined">
            Extra small
          </Button>
          <Button size="s" variant="tonal" trailingIcon="chevron_right">
            Small
          </Button>
          <Button size="m" icon="add">
            Medium
          </Button>
          <Button disabled>Unavailable</Button>
          <Button pending icon="edit">
            Saving…
          </Button>
        </div>
        <Button fullWidth variant="tonal" icon="calendar_month">
          Add this recurring commitment to my weekly calendar
        </Button>
        <SaveExample theme={theme} />
      </Example>
      <Example title="Icon button and link">
        <div className={row}>
          {iconVariants.map(([variant, label, icon]) => (
            <IconButton
              key={variant}
              variant={variant}
              label={label}
              icon={icon}
            />
          ))}
          <IconButton
            variant="tonal"
            label="Pin to overview"
            icon="flag"
            size={40}
            selected={star}
            onClick={() => setStar(!star)}
          />
          <IconButton label="Archive unavailable" icon="archive" disabled />
          <IconLink
            label="Jump to fields"
            icon="arrow_downward"
            href={anchor}
          />
          <IconLink
            variant="filled"
            label="Jump to actions"
            icon="arrow_upward"
            href={`#${theme}-theme`}
          />
          <IconLink
            variant="tonal"
            label="Jump to date field"
            icon="calendar_month"
            href={`#${theme}-date`}
          />
          <IconLink
            variant="outlined"
            label="Jump to time field"
            icon="schedule"
            href={`#${theme}-time`}
          />
        </div>
      </Example>
      <Example title="Floating action and menu">
        <div className={cx(row, "justify-end")}>
          <Fab
            label="Import unavailable"
            icon="archive"
            placement="inline"
            disabled
          />
          <Fab
            label="Add task"
            placement="inline"
            onClick={() => setLastAction("Task action selected.")}
          />
          <Fab
            label="Add event"
            icon="event"
            extended
            placement="inline"
            onClick={() => setLastAction("Event action selected.")}
          />
          <FabMenu
            label="Create menu"
            placement="inline"
            items={[
              {
                label: "Create task",
                icon: "add_task",
                shortcut: "Q",
                onSelect: () => setLastAction("Task action selected."),
              },
              {
                label: "Create note",
                icon: "note_add",
                onSelect: () => setLastAction("Note action selected."),
              },
              { label: "Jump to fields", icon: "keyboard", href: anchor },
              {
                label: "Import unavailable",
                icon: "archive",
                onSelect: () => {},
                disabled: true,
              },
            ]}
          />
        </div>
        <p
          role="status"
          className="min-h-4 text-body-small text-on-surface-variant"
        >
          {lastAction}
        </p>
      </Example>
      <Example title="Connected button group">
        <ConnectedButtonGroup
          label={`${title} gallery sections`}
          value="actions"
          size="xs"
          items={[
            { value: "actions", label: "Actions", href: `#${theme}-theme` },
            { value: "fields", label: "Fields", href: anchor, icon: "edit" },
          ]}
        />
        <ConnectedButtonGroup
          label={`${title} range`}
          value={range}
          onValueChange={setRange}
          items={[
            { value: "week", label: "Week" },
            { value: "month", label: "Four weeks" },
            { value: "quarter", label: "Twelve weeks" },
            { value: "year", label: "Year", disabled: true },
          ]}
        />
      </Example>
      <Example title="Chip">
        <div className={row}>
          <Chip type="assist" label="Open fields" icon="event" href={anchor} />
          <Chip type="assist" label="Block time" icon="schedule" disabled />
          <Chip
            type="filter"
            label="Scheduled"
            selected={filter}
            onClick={() => setFilter(!filter)}
          />
          <Chip type="filter" label="Upcoming" selected />
          <Chip type="filter" label="Done" selected={false} disabled />
        </div>
        <div className={row}>
          {chip ? (
            <Chip
              type="input"
              label="Reading and research"
              onRemove={() => setChip(false)}
            />
          ) : (
            <Button variant="text" onClick={() => setChip(true)}>
              Restore reading and research
            </Button>
          )}
          <Chip type="status" label="Paused" icon="pause" />
          <Chip type="status" label="Saved" tone="success" icon="check" />
          <Chip
            type="status"
            label="Needs review"
            tone="warning"
            icon="warning"
          />
          <Chip type="status" label="Failed" tone="error" icon="error" />
          <Chip type="metric" label="planned" count={4} />
          <Chip type="metric" label="due" count={0} />
        </div>
      </Example>
      <Example title="Checkbox">
        <Checkbox label="Show tasks without a date" />
        <Checkbox label="Include scheduled tasks" defaultChecked />
        <Checkbox
          label="Select all displayed tasks"
          defaultChecked="indeterminate"
        />
        <Checkbox label="Morning reading" shape="round" defaultChecked />
        <Checkbox label="Walk after lunch" shape="round" />
        <Checkbox label="Imported task" disabled defaultChecked />
      </Example>
      <Example title="Switch and radio">
        <Switch label="Reminders" />
        <SwitchRow
          label="Weekly review reminder"
          description="Send a reminder when the review is ready."
          defaultChecked
        />
        <SwitchRow
          label="Push notifications"
          description="Enable notifications on this device first."
          disabled
        />
        <RadioGroup label={`${title} reminder frequency`} defaultValue="weekly">
          <RadioRow label="Daily" value="daily" />
          <RadioRow
            label="Weekly"
            value="weekly"
            description="On the first day of your week."
          />
          <RadioRow label="Custom schedule" value="custom" disabled />
        </RadioGroup>
      </Example>
      <Example title="Tabs">
        <Tabs
          mode="link"
          label={`${title} planner pages`}
          value="overview"
          items={[
            { value: "overview", label: "Overview", href: `#${theme}-theme` },
            { value: "fields", label: "Field examples", href: anchor },
          ]}
        />
        <Tabs
          mode="panel"
          label={`${title} preview panels`}
          defaultValue="today"
          items={[
            { value: "today", label: "Today", panel: "Three planned tasks." },
            {
              value: "week",
              label: "This week",
              panel: "Two scheduled commitments.",
            },
            {
              value: "archive",
              label: "Archive",
              panel: "Archive is unavailable.",
              disabled: true,
            },
          ]}
        />
      </Example>
      <div id={`${theme}-fields`} className="min-w-0">
        <FieldExamples theme={theme} />
      </div>
    </section>
  );
}

function SaveExample({ theme }: { theme: Theme }) {
  const [status, setStatus] = useState<"idle" | "saving" | "error" | "saved">(
    "idle",
  );
  const [shouldFail, setShouldFail] = useState(true);
  const pending = status === "saving";
  const error = status === "error";
  const saved = status === "saved";
  const submitLabel = pending ? "Saving…" : error ? "Retry save" : "Save";

  return (
    <form
      aria-label={`${theme} save preview`}
      className="grid min-w-0 gap-2 rounded-lg bg-surface-container-low p-3"
      onSubmit={(event) => {
        event.preventDefault();
        setStatus("saving");
      }}
    >
      <FormField
        id={`${theme}-preview-title`}
        label="Commitment name"
        errors={
          error
            ? ["Could not save the preview. Your text is still here."]
            : undefined
        }
      >
        {(control) => (
          <Input {...control} defaultValue="Review next week’s commitments" />
        )}
      </FormField>
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 bg-surface-container-low pb-[env(safe-area-inset-bottom)]">
        <Button
          type="submit"
          icon="check"
          pending={pending}
          className="min-w-30"
        >
          {/* Size the target for every label in the current font and text size. */}
          <span className="grid">
            {["Save", "Saving…", "Retry save"].map((label) => (
              <span
                key={label}
                className={cx(
                  "col-start-1 row-start-1",
                  label !== submitLabel && "invisible",
                )}
              >
                {label}
              </span>
            ))}
          </span>
        </Button>
        <Button
          variant="outlined"
          disabled={!pending}
          onClick={() => {
            setStatus(shouldFail ? "error" : "saved");
            setShouldFail(false);
          }}
        >
          Resolve preview
        </Button>
        <Button
          variant="text"
          disabled={!saved}
          onClick={() => setStatus("idle")}
        >
          Undo
        </Button>
      </div>
      <p
        role="status"
        className={cx(
          "min-h-4 text-body-small",
          saved
            ? "text-success"
            : error
              ? "text-error"
              : "text-on-surface-variant",
        )}
      >
        {pending
          ? "Preview save pending."
          : error
            ? "Preview save failed."
            : saved
              ? "Preview saved."
              : "Preview only · first save fails"}
      </p>
    </form>
  );
}

function FieldExamples({ theme }: { theme: Theme }) {
  return (
    <Example title="Fields and number stepper">
      <FormField
        id={`${theme}-title`}
        label="A long label for a recurring commitment in your weekly plan"
        hint="Use a name you will recognise in the calendar."
      >
        {(control) => <Input {...control} defaultValue="Read in the morning" />}
      </FormField>
      <FormField
        id={`${theme}-note`}
        label="Notes"
        errors={["Enter a note before continuing."]}
      >
        {(control) => (
          <Textarea
            {...control}
            placeholder="e.g. Bring a library card"
            rows={3}
          />
        )}
      </FormField>
      <FormField id={`${theme}-draft`} label="Draft notes">
        {(control) => (
          <Textarea
            {...control}
            defaultValue="Bring the library card."
            rows={2}
          />
        )}
      </FormField>
      <FormField id={`${theme}-category`} label="Life area" hint="Optional.">
        {(control) => (
          <Select {...control} defaultValue="learning">
            <option value="learning">Learning</option>
            <option value="health">Health</option>
          </Select>
        )}
      </FormField>
      <div className="grid gap-3 medium:grid-cols-2">
        <FormField id={`${theme}-date`} label="Start date">
          {(control) => (
            <Input {...control} type="date" defaultValue="2026-11-12" />
          )}
        </FormField>
        <FormField id={`${theme}-time`} label="Start time">
          {(control) => <Input {...control} type="time" defaultValue="08:30" />}
        </FormField>
      </div>
      <FormField
        id={`${theme}-invalid-text`}
        label="Short title"
        errors={["Enter a title."]}
      >
        {(control) => <Input {...control} />}
      </FormField>
      <FormField
        id={`${theme}-invalid-select`}
        label="Remind me"
        errors={["Choose a time."]}
      >
        {(control) => (
          <Select {...control}>
            <option>Choose a time</option>
          </Select>
        )}
      </FormField>
      <FormField id={`${theme}-disabled-input`} label="Created by">
        {(control) => <Input {...control} defaultValue="Rina" disabled />}
      </FormField>
      <FormField id={`${theme}-disabled-note`} label="Archived notes">
        {(control) => (
          <Textarea
            {...control}
            defaultValue="Read only after archive."
            rows={2}
            disabled
          />
        )}
      </FormField>
      <FormField id={`${theme}-disabled-select`} label="Archived life area">
        {(control) => (
          <Select {...control} disabled>
            <option>Learning</option>
          </Select>
        )}
      </FormField>
      <NumberStepper
        label="Pages"
        min={0}
        max={10}
        defaultValue="0"
        hint="0–10 pages"
      />
      <NumberStepper label="Minutes" min={0} max={10} defaultValue="10" />
      <NumberStepper
        label="Sessions"
        min={0}
        max={10}
        defaultValue="3"
        disabled
      />
    </Example>
  );
}
