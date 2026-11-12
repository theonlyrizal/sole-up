import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EmptyState } from "./empty-state";
import { FormError } from "./form-error";
import { InlineBanner } from "./inline-banner";
import { ListGroup, ListItem } from "./list";
import { LoadingIndicator } from "./loading-indicator";
import { SaveStatus } from "./save-status";

describe("segmented lists", () => {
  it("uses outer corners only on the first and last positions, including a single row", () => {
    const html = render(
      <ListGroup label="Planned tasks">
        <ListItem headline="Read" />
        <ListItem headline="Write" />
        <ListItem headline="Submit" />
      </ListGroup>,
    );
    expect(html).toContain('<ul aria-label="Planned tasks"');
    for (const row of html.matchAll(/<li class="([^"]+)"/g)) {
      expect(row[1]).toContain("rounded-xs");
      expect(row[1]).toContain("first:rounded-t-lg");
      expect(row[1]).toContain("last:rounded-b-lg");
    }
    expect(html.match(/<li /g)).toHaveLength(3);
  });

  it("uses full corners and a current link for the selected row", () => {
    const html = render(<ListItem headline="Read" href="/notes" selected />);
    expect(html).toContain("rounded-full");
    expect(html).not.toContain("first:rounded-t-lg");
    expect(html).toMatch(/<a [^>]*aria-current="page"[^>]*>Read<\/a>/);
  });
});

describe("feedback states", () => {
  it("keeps compact empty-state art decorative and uses the requested heading level", () => {
    const html = render(
      <EmptyState
        title="No workshops"
        headingLevel={3}
        art={{ icon: "inbox" }}
        compact
      />,
    );
    expect(html).toMatch(/<h3[^>]*>No workshops<\/h3>/);
    expect(html).toContain('aria-hidden="true"');
  });

  it.each([
    ["info", "status"],
    ["success", "status"],
    ["warning", "alert"],
    ["error", "alert"],
  ] as const)("announces %s banners as %s", (tone, role) => {
    expect(render(<InlineBanner tone={tone}>Details</InlineBanner>)).toContain(
      `role="${role}"`,
    );
  });

  it("announces form-level errors and skips a field-only validation failure", () => {
    const error = {
      code: "VALIDATION",
      message: "Check the form.",
      fieldErrors: { title: ["Required."] },
      formErrors: [],
    } as const;
    const fieldOnly = {
      ...error,
      fieldErrors: { title: ["Required."] },
      formErrors: [],
    };
    expect(render(<FormError error={fieldOnly} />)).toBe("");
    const html = render(
      <FormError
        error={{ ...fieldOnly, formErrors: ["Choose a new date."] }}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Choose a new date.");
  });

  it("names indeterminate progress and can be decorative in an already labelled control", () => {
    expect(render(<LoadingIndicator />)).toContain(
      'role="progressbar" aria-label="Loading"',
    );
    expect(render(<LoadingIndicator label="Loading workshops" />)).toContain(
      'aria-label="Loading workshops"',
    );
    expect(render(<LoadingIndicator decorative />)).not.toContain(
      "progressbar",
    );
  });

  it.each([
    ["saving", "Saving…"],
    ["saved", "Saved"],
    ["error", "Not saved"],
  ] as const)("keeps a polite live region when %s", (phase, label) => {
    const html = render(<SaveStatus phase={phase} onRetry={() => {}} />);
    expect(html).toContain(
      'role="status" aria-live="polite" aria-atomic="true"',
    );
    expect(html).toContain(label);
    expect(html.includes(">Retry</button>")).toBe(phase === "error");
  });
});
