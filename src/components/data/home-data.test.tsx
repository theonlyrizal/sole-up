import { renderToStaticMarkup as render } from "react-dom/server";
import { describe, expect, it } from "vitest";
import HomeLoading from "@/app/(app)/home/loading";
import { MetricCard } from "./metric-card";
import { SegmentedPillBar } from "./segmented-pill-bar";
import { StatNumber } from "./stat-number";

describe("Home data components", () => {
  it("announces the Home skeleton once and keeps its placeholders decorative", () => {
    const html = render(<HomeLoading />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading home…");
    expect(
      html.match(/aria-hidden="true" class="skeleton [^"]*rounded-full/g),
    ).toHaveLength(8);
  });

  it("links the numeral and its unit together", () => {
    const html = render(
      <StatNumber
        value={3}
        unit="planned for today"
        href="/plan/today#today-planned"
      />,
    );
    expect(html).toMatch(
      /<a [^>]*href="\/plan\/today#today-planned"[^>]*><span[^>]*>3<\/span> <span>planned for today<\/span><\/a>/,
    );
  });

  it("renders the real fractional fill with a text equivalent on mount", () => {
    const html = render(
      <SegmentedPillBar
        value={1.5}
        total={3}
        label="1.5 of 3 days so far this week"
      />,
    );
    expect(html).toContain(
      'role="img" aria-label="1.5 of 3 days so far this week"',
    );
    expect(
      Array.from(html.matchAll(/height:(\d+)%/g), (match) => match[1]),
    ).toEqual(["100", "50", "0"]);
  });

  it("keeps proportional fill when capping the visible units and omits a zero target", () => {
    const capped = render(
      <SegmentedPillBar value={5} total={20} max={10} label="5 of 20 days" />,
    );
    expect(
      Array.from(capped.matchAll(/height:(\d+)%/g), (match) => match[1]),
    ).toEqual(["100", "100", "50", "0", "0", "0", "0", "0", "0", "0"]);
    expect(
      render(<SegmentedPillBar value={0} total={0} label="Nothing expected" />),
    ).toBe("");
  });

  it.each([true, false])(
    "distinguishes an actual zero from missing data (%s)",
    (hasData) => {
      const html = render(
        <MetricCard
          id="goals"
          title="Goals"
          metric={{
            value: 0,
            hasData,
            definition: "Active goals",
            range: {
              from: null,
              to: null,
              asOf: new Date("2026-11-13T12:00Z"),
              timeZone: "UTC",
            },
          }}
          empty={{
            description: "Add a goal to get started",
            link: { href: "/goals", label: "Add a goal" },
          }}
          todayDate="2026-11-13"
          locale="en-GB"
        >
          <StatNumber value={0} unit="goals" />
        </MetricCard>,
      );
      expect(html).toContain('aria-labelledby="goals-heading"');
      expect(html).toContain('aria-label="How this is counted: Goals"');
      expect(html).toContain("Any date");
      expect(html.includes("Nothing yet")).toBe(!hasData);
      expect(html.includes(">0</span>")).toBe(hasData);
    },
  );
});
