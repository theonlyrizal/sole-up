import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { Icon } from "./icon";

it("renders an unfocusable, decorative Material Symbol at 24 pixels by default", () => {
  const markup = renderToStaticMarkup(<Icon name="home" />);
  expect(markup).toContain('aria-hidden="true"');
  expect(markup).toContain('focusable="false"');
  expect(markup).toContain('viewBox="0 -960 960 960"');
  expect(markup).toContain('width="24" height="24"');
  expect(markup).toContain('fill="currentColor"');
  expect(markup).toContain("<path d=");
});

it("renders a different path for the filled variant and supports dense sizing", () => {
  const outlined = renderToStaticMarkup(<Icon name="home" size={20} />);
  const filled = renderToStaticMarkup(<Icon name="home" size={20} filled />);
  expect(filled).toContain('width="20" height="20"');
  expect(filled.match(/<path d="([^"]+)"/)?.[1]).not.toBe(
    outlined.match(/<path d="([^"]+)"/)?.[1],
  );
});
