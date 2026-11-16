import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isGalleryAvailable } from "@/app/(dev)/dev/ui/gallery-availability";
import { Button, buttonClass, type ButtonVariant } from "./button";
import { ConnectedButtonGroup } from "./button-group";
import { Checkbox } from "./checkbox";
import { Chip } from "./chip";
import { SearchBar } from "./search-bar";
import { Fab, FabMenu } from "./fab";
import { FormField } from "./form-field";
import { IconButton, IconLink } from "./icon-button";
import { Input } from "./input";
import { NumberStepper } from "./number-stepper";
import { RadioGroup, RadioRow, RadioSwatch } from "./radio-group";
import { Select } from "./select";
import { ShapeAvatar } from "./shape-avatar";
import { Switch, SwitchRow } from "./switch";
import { Tabs } from "./tabs";
import { Textarea } from "./textarea";

const noop = () => {};
const links = [
  { value: "week", label: "Week", href: "/track?range=week" },
  { value: "month", label: "Four weeks", href: "/track?range=4w" },
];
const choices = links.map(({ label, value }) => ({ label, value }));

it("renders named swatches with checked radio semantics", () => {
  const html = render(
    <RadioGroup label="Colour" defaultValue="teal">
      <RadioSwatch label="Teal" value="teal" />
      <RadioSwatch label="No colour" value="none" />
    </RadioGroup>,
  );
  expect(html).toMatch(
    /role="radio"[^>]*aria-checked="true"[^>]*aria-label="Teal"/,
  );
  expect(html).toMatch(
    /role="radio"[^>]*aria-checked="false"[^>]*aria-label="No colour"/,
  );
});

describe("Button", () => {
  it.each([
    ["primary", "filled"],
    ["secondary", "outlined"],
    ["ghost", "text"],
  ] as const)("maps %s to %s", (alias, variant) => {
    expect(buttonClass({ variant: alias })).toBe(buttonClass({ variant }));
  });

  it.each([
    ["sm", "xs"],
    ["md", "s"],
  ] as const)("maps %s to %s", (alias, size) => {
    expect(buttonClass({ size: alias })).toBe(buttonClass({ size }));
  });

  it.each<ButtonVariant>([
    "filled",
    "tonal",
    "outlined",
    "text",
    "elevated",
    "danger",
    "danger-text",
  ])("renders the %s action class", (variant) => {
    expect(render(<Button variant={variant}>Go</Button>)).toContain(
      `action-${variant}`,
    );
  });

  it("preserves the action name, reports busy and blocks repeat submissions", () => {
    const html = render(
      <Button
        pending
        icon="check"
        trailingIcon="chevron_right"
        fullWidth
        type="submit"
      >
        Save
      </Button>,
    );
    expect(html).toMatch(
      /<button[^>]*type="submit"[^>]*disabled=""[^>]*aria-busy="true"/,
    );
    expect(html).toContain("action-spinner");
    expect(html).toContain("</span>Save<span");
    expect(html).toContain("w-full");
  });
});

it("IconButton keeps its label, pressed state and disabled state", () => {
  const html = render(<IconButton label="Pin" icon="flag" selected disabled />);
  expect(html).toMatch(
    /<button[^>]*disabled=""[^>]*aria-label="Pin"[^>]*aria-pressed="true"/,
  );
  expect(html).toContain('aria-hidden="true"');
});

it("IconLink preserves the destination, name and current page", () => {
  const html = render(
    <IconLink
      label="Settings"
      icon="settings"
      href="/settings"
      aria-current="page"
    />,
  );
  expect(html).toMatch(
    /<a[^>]*aria-current="page"[^>]*aria-label="Settings"[^>]*href="\/settings"/,
  );
});

it("Fab names an icon-only trigger and supports an extended label", () => {
  expect(render(<Fab label="Create" disabled />)).toMatch(
    /<button[^>]*disabled=""[^>]*aria-label="Create"/,
  );
  expect(render(<Fab label="Create note" extended />)).toContain(
    ">Create note</span>",
  );
});

it("FabMenu names a collapsed menu trigger", () => {
  const html = render(
    <FabMenu
      label="Create"
      items={[{ label: "Note", icon: "add", onSelect: noop }]}
    />,
  );
  expect(html).toContain('aria-haspopup="menu"');
  expect(html).toContain('aria-expanded="false"');
  expect(html).toContain('aria-label="Create"');
  expect(html).not.toContain('role="menu"');
});

describe("ConnectedButtonGroup", () => {
  it("marks only the current link in labelled navigation", () => {
    const html = render(
      <ConnectedButtonGroup label="Range" items={links} value="week" />,
    );
    expect(html).toMatch(/<nav[^>]*aria-label="Range"/);
    expect(html).toMatch(
      /<a[^>]*aria-current="page"[^>]*href="\/track\?range=week"/,
    );
    expect(html.match(/aria-current/g)).toHaveLength(1);
  });
  it("keeps accessible link names and selection with compact labels", () => {
    const html = render(
      <ConnectedButtonGroup
        label="Calendar view"
        items={links}
        value="week"
        compactLabels
      />,
    );
    expect(html).toContain('aria-label="Calendar view"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain(">Week</a>");
    expect(html).toContain(">Four weeks</a>");
  });
  it("uses single-choice Radix radio semantics for toggle mode", () => {
    const html = render(
      <ConnectedButtonGroup
        label="Range"
        items={choices}
        value="month"
        onValueChange={noop}
      />,
    );
    expect(html).toContain('role="radiogroup"');
    expect(html).toContain('aria-label="Range"');
    expect(html).toMatch(/role="radio" aria-checked="false"/);
    expect(html).toMatch(/role="radio" aria-checked="true"/);
  });
});

describe("Chip", () => {
  it("renders assist links, pressed filter buttons and named remove actions", () => {
    const html = render(
      <>
        <Chip
          type="assist"
          label="Open calendar"
          icon="event"
          href="/plan/calendar"
        />
        <Chip type="filter" label="Scheduled" selected disabled />
        <Chip type="input" label="Reading" onRemove={noop} />
      </>,
    );
    expect(html).toMatch(/<a[^>]*href="\/plan\/calendar"/);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*disabled=""/);
    expect(html).toContain('aria-label="Remove Reading"');
  });

  it("renders static status and the real metric count, including zero", () => {
    const html = render(
      <>
        <Chip type="status" label="Paused" />
        <Chip type="metric" label="due" count={0} />
        <Chip type="metric" label="planned" count={2} />
      </>,
    );
    expect(html).toContain(">Paused</span>");
    expect(html).toContain(">0 due</span>");
    expect(html).toContain(">2 planned</span>");
    expect(html).not.toMatch(/<a\b|<button\b/);
  });
});

it("lets a linked input chip expose a separate, named removal button", () => {
  const html = render(
    <Chip
      type="input"
      href="/goals/example"
      label="Weekend walk"
      detail={<Chip type="status" label="Active" />}
      onRemove={noop}
      removeLabel="Unlink Weekend walk"
      removeDisabled
    />,
  );
  expect(html).toMatch(
    /<a [^>]*href="\/goals\/example">.*Active.*<\/a><button/,
  );
  expect(html).toMatch(
    /<button[^>]*disabled=""[^>]*aria-label="Unlink Weekend walk"/,
  );
  expect(
    render(<Chip type="input" label="Will link to: Weekend walk" />),
  ).not.toContain("<button");
});

it("renders a labelled search input and gives the clear action a button name", () => {
  const search = (value: string) =>
    render(
      <SearchBar
        aria-label="Search for"
        value={value}
        onChange={noop}
        onClear={noop}
      />,
    );
  expect(search("walk")).toMatch(
    /<input[^>]*aria-label="Search for"[^>]*type="search"/,
  );
  expect(search("walk")).toMatch(
    /<button[^>]*type="button"[^>]*aria-label="Clear search"/,
  );
  expect(search("")).not.toContain("Clear search");
});

it("Checkbox links the visible label to square, round and mixed controls", () => {
  const html = render(
    <>
      <Checkbox id="square" label="All tasks" defaultChecked="indeterminate" />
      <Checkbox id="round" label="Read" shape="round" defaultChecked disabled />
    </>,
  );
  expect(html).toContain('<label for="square"');
  expect(html).toContain('<label for="round"');
  expect(html).toContain('aria-labelledby="round-label"');
  expect(html).toMatch(/role="checkbox" aria-checked="mixed"/);
  expect(html).toMatch(/role="checkbox" aria-checked="true"[^>]*disabled=""/);
});

it("Switch and SwitchRow link visible labels and describe rows separately", () => {
  const html = render(
    <>
      <Switch id="reminders" label="Reminders" />
      <SwitchRow
        id="review"
        label="Review"
        description="Once a week"
        defaultChecked
        disabled
      />
    </>,
  );
  expect(html).toContain('<label for="reminders"');
  expect(html).toContain('<label for="review"');
  expect(html).toContain('aria-describedby="review-description"');
  expect(html).toContain('aria-labelledby="review-label"');
  expect(html).toMatch(/role="switch" aria-checked="false"/);
  expect(html).toMatch(/role="switch" aria-checked="true"[^>]*disabled=""/);
});

it("RadioRow can keep native checked state, grouping, and descriptions", () => {
  const html = render(
    <RadioRow
      native
      id="scope-this"
      name="scope"
      label="This event"
      value="this"
      checked
      aria-describedby="scope-help"
      onChange={noop}
    />,
  );
  expect(html).toContain('for="scope-this"');
  expect(html).toMatch(/<input[^>]*type="radio"/);
  expect(html).toContain('name="scope"');
  expect(html).toContain('checked=""');
  expect(html).toContain('aria-describedby="scope-help"');
});

it("RadioGroup names its group and RadioRow links the choices", () => {
  const html = render(
    <RadioGroup label="Frequency" defaultValue="week">
      <RadioRow id="daily" label="Daily" value="day" />
      <RadioRow
        id="weekly"
        label="Weekly"
        value="week"
        description="On Sundays"
      />
      <RadioRow label="Custom" value="custom" disabled />
    </RadioGroup>,
  );
  expect(html).toContain('role="radiogroup"');
  expect(html).toContain('aria-label="Frequency"');
  expect(html).toContain('<label for="weekly"');
  expect(html).toContain('aria-describedby="weekly-description"');
  expect(html).toMatch(/role="radio" aria-checked="true"/);
  expect(html).toMatch(/role="radio" aria-checked="false"[^>]*disabled=""/);
});

it("NumberStepper keeps a labelled, named decimal input and disables the action at its bound", () => {
  const html = render(
    <NumberStepper
      id="pages"
      name="quantity"
      label="Pages"
      min={1}
      max={10}
      defaultValue="1"
    />,
  );
  expect(html).toContain('<label for="pages"');
  expect(html).toContain('inputMode="decimal"');
  expect(html).toContain('name="quantity"');
  expect(html).toMatch(
    /<button[^>]*disabled=""[^>]*aria-label="Decrease Pages"/,
  );
  expect(html).toContain('aria-label="Increase Pages"');
});

describe("Tabs", () => {
  it("link mode exposes navigation with the current page", () => {
    const html = render(
      <Tabs mode="link" label="History" value="month" items={links} />,
    );
    expect(html).toContain('aria-label="History"');
    expect(html).toMatch(
      /<a[^>]*aria-current="page"[^>]*href="\/track\?range=4w"/,
    );
  });
  it("panel mode exposes tabs and the labelled selected panel", () => {
    const html = render(
      <Tabs
        mode="panel"
        label="History"
        defaultValue="week"
        items={[
          { ...choices[0]!, panel: "Week data" },
          { ...choices[1]!, panel: "Month data", disabled: true },
        ]}
      />,
    );
    expect(html).toContain('role="tablist"');
    expect(html).toMatch(
      /role="tab" aria-selected="true" aria-controls="([^"]+)"/,
    );
    expect(html).toMatch(/role="tab" aria-selected="false"[^>]*disabled=""/);
    expect(html).toMatch(
      /role="tabpanel" aria-labelledby="[^"]+"[^>]*>Week data/,
    );
  });
});

it("ShapeAvatar uses one grapheme and preserves identity when renamed", () => {
  const renderAvatar = (label: string) =>
    render(
      <ShapeAvatar entityType="habit" id="same-id" label={label} size={40} />,
    );
  const html = renderAvatar("e\u0301tude");
  const renamed = renderAvatar("Reading");
  expect(html).toContain('aria-hidden="true"');
  expect(html).toContain(">E\u0301</span>");
  expect(html.match(/<path[^>]+>/)?.[0]).toBe(
    renamed.match(/<path[^>]+>/)?.[0],
  );
});

describe("Filled fields", () => {
  it("Input keeps native name, type, required, and a static inner label", () => {
    const html = render(
      <FormField id="when" label="Start date" hint="Optional for drafts.">
        {(control) => <Input {...control} name="date" type="date" required />}
      </FormField>,
    );
    expect(html).toMatch(/class="filled-field"[^>]*><label for="when"/);
    expect(html).toMatch(
      /<input[^>]*id="when"[^>]*aria-describedby="when-hint"[^>]*type="date"/,
    );
    expect(html).toContain('required=""');
    expect(html).toContain('name="date"');
  });
  it("Textarea preserves rows, value and error association", () => {
    const html = render(
      <FormField id="notes" label="Notes" errors={["Too long."]}>
        {(control) => <Textarea {...control} rows={2} defaultValue="Draft" />}
      </FormField>,
    );
    expect(html).toMatch(
      /<textarea rows="2"[^>]*id="notes"[^>]*aria-describedby="notes-error"[^>]*aria-invalid="true">Draft/,
    );
    expect(html).toContain("field-error-icon");
  });
  it("Select preserves the native control, label, disabled state and selected option", () => {
    const html = render(
      <FormField id="area" label="Area">
        {(control) => (
          <Select {...control} disabled defaultValue="work">
            <option value="work">Work</option>
          </Select>
        )}
      </FormField>,
    );
    expect(html).toContain('<label for="area"');
    expect(html).toMatch(/<select[^>]*id="area"[^>]*disabled=""/);
    expect(html).toContain('<option value="work" selected="">Work</option>');
  });
});

it("the gallery rejects production", () => {
  expect(isGalleryAvailable("production")).toBe(false);
  expect(isGalleryAvailable("development")).toBe(true);
});
