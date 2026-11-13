import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DateBadge } from "./date-badge";
import { StatusChip } from "./status-chip";

describe("DateBadge", () => {
  it("provides the full local date once and marks the current day", () => {
    const html = render(
      <DateBadge
        date="2026-11-13"
        today="2026-11-13"
        locale="en-GB"
        label="Friday, 13 November 2026"
      />,
    );
    expect(html).toContain('<time dateTime="2026-11-13" aria-current="date">');
    expect(html.match(/Friday, 13 November 2026/g)).toHaveLength(1);
  });

  it("omits current-date semantics on a different day", () => {
    const html = render(
      <DateBadge
        date="2026-11-14"
        today="2026-11-13"
        locale="en-GB"
        label="Tomorrow · Saturday, 14 November 2026"
        relative="Tomorrow"
      />,
    );
    expect(html).not.toContain("aria-current");
    expect(html).toContain("Sat 14 Nov · Tomorrow");
  });
});

describe("StatusChip", () => {
  it.each([
    ["active", "Active"],
    ["open", "Open"],
    ["completed", "Completed"],
    ["paused", "Paused"],
    ["dropped", "Dropped"],
    ["cancelled", "Cancelled"],
    ["archived", "Archived"],
  ] as const)("renders the visible label for %s", (status, label) => {
    expect(render(<StatusChip status={status} />)).toContain(
      `>${label}</span>`,
    );
  });
});
