import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";

import { SplitStat } from "./split-stat";

it("keeps both counts next to their respective labels, including zero", () => {
  const html = renderToStaticMarkup(
    <SplitStat
      figures={[
        { label: "Planned", value: 3 },
        { label: "Completed", value: 0 },
      ]}
    />,
  );
  expect(html).toMatch(/<dt[^>]*>Planned<\/dt><dd[^>]*>3<\/dd>/);
  expect(html).toMatch(/<dt[^>]*>Completed<\/dt><dd[^>]*>0<\/dd>/);
});
