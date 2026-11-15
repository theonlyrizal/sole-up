import { renderToStaticMarkup as render } from "react-dom/server";
import { expect, it } from "vitest";

import { MilestoneArc } from "./milestone-arc";

it.each([
  { countable: 0, completed: 0, marks: 0 },
  { countable: 1, completed: 1, marks: 1 },
  { countable: 5, completed: 3, marks: 5 },
  { countable: 13, completed: 6, marks: 1 },
])(
  "renders $marks marks for $countable countable milestones",
  ({ countable, completed, marks }) => {
    const html = render(<MilestoneArc progress={{ countable, completed }} />);
    expect(html.match(/data-milestone-segment/g) ?? []).toHaveLength(marks);
    expect(html).not.toContain("data-milestone-motion");
    if (countable === 0) expect(html).toBe("");
  },
);

it("uses the same progress label for the detail image and the mini arc caption", () => {
  const progress = { countable: 5, completed: 3 };
  expect(render(<MilestoneArc progress={progress} />)).toContain(
    'role="img" aria-label="3 of 5 milestones completed"',
  );
  expect(render(<MilestoneArc progress={progress} size="mini" />)).toContain(
    ">3 of 5 milestones<",
  );
  expect(
    render(<MilestoneArc progress={{ countable: 1, completed: 0 }} />),
  ).toContain('aria-label="0 of 1 milestone completed"');
});
