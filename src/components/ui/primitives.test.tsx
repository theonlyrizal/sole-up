import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button } from "./button";
import { EmptyState } from "./empty-state";
import { ErrorState } from "./error-state";
import { FormField } from "./form-field";
import { Input } from "./input";
import { LoadingState } from "./skeleton";

/** Server-renders to an HTML string for markup assertions. */
function render(node: React.ReactNode) {
  return renderToStaticMarkup(node);
}

describe("FormField", () => {
  it("links the label, hint and errors to the control", () => {
    const html = render(
      <FormField
        id="title"
        label="Title"
        hint="Short is fine."
        errors={["Required."]}
      >
        {(control) => <Input {...control} name="title" />}
      </FormField>,
    );
    expect(html).toContain('<label for="title"');
    expect(html).toContain('id="title"');
    expect(html).toContain('aria-describedby="title-hint title-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('<p id="title-hint"');
    expect(html).toContain(
      '<p id="title-error" class="text-sm text-danger">Required.</p>',
    );
  });

  it("describes only by the hint when there are no errors", () => {
    const html = render(
      <FormField id="f" label="Field" hint="A hint." errors={[]}>
        {(control) => <Input {...control} />}
      </FormField>,
    );
    expect(html).toContain('aria-describedby="f-hint"');
    expect(html).not.toContain("aria-invalid=");
    expect(html).not.toContain("f-error");
  });

  it("adds no aria-describedby without a hint or errors", () => {
    const html = render(
      <FormField id="f" label="Field">
        {(control) => <Input {...control} />}
      </FormField>,
    );
    expect(html).not.toContain("aria-describedby");
  });
});

describe("Button", () => {
  it("never submits a form unless asked to", () => {
    expect(render(<Button>Go</Button>)).toContain('type="button"');
    expect(render(<Button type="submit">Go</Button>)).toContain(
      'type="submit"',
    );
  });
});

describe("states", () => {
  it("EmptyState uses the requested heading level", () => {
    expect(render(<EmptyState title="Nothing" headingLevel={3} />)).toContain(
      "<h3",
    );
  });

  it("ErrorState is an alert and offers a retry only when given one", () => {
    expect(render(<ErrorState />)).toContain('role="alert"');
    expect(render(<ErrorState />)).not.toContain("<button");
    expect(render(<ErrorState onRetry={() => {}} />)).toMatch(
      /<button[^>]*>Try again<\/button>/,
    );
  });

  it("LoadingState is announced, its skeletons are not", () => {
    const html = render(<LoadingState label="Loading goals" />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading goals…");
    expect(html).toContain('aria-hidden="true"');
  });
});
