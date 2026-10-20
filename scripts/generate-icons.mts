/**
 * Generates the app icons from the SVG artwork below. Run after changing the
 * artwork: `node scripts/generate-icons.mts`. Rasterizes with Playwright's
 * Chromium (already a dev dependency) and writes:
 *
 * - src/app/icon.svg          favicon for modern browsers (Next links it)
 * - src/app/apple-icon.png    180×180, iOS home screen (Next links it)
 * - public/icons/icon-*.png   192 and 512, referenced by the web manifest
 * - public/icons/maskable-512.png  full-bleed, art inside the 80% safe zone
 */
import { writeFileSync } from "node:fs";

import { chromium } from "@playwright/test";

// Keep in sync with --accent (light) in src/app/globals.css.
const ACCENT = "#2f6f5e";

const art = `
  <path d="M160 300 L256 204 L352 300" fill="none" stroke="#fff" stroke-width="44" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M176 368 H336" fill="none" stroke="#fff" stroke-width="44" stroke-linecap="round" stroke-opacity="0.6"/>`;

const roundedSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="${ACCENT}"/>${art}
</svg>
`;

const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="${ACCENT}"/>${art}
</svg>
`;

const outputs: { path: string; svg: string; size: number }[] = [
  { path: "src/app/apple-icon.png", svg: maskableSvg, size: 180 },
  { path: "public/icons/icon-192.png", svg: roundedSvg, size: 192 },
  { path: "public/icons/icon-512.png", svg: roundedSvg, size: 512 },
  { path: "public/icons/maskable-512.png", svg: maskableSvg, size: 512 },
];

writeFileSync("src/app/icon.svg", roundedSvg);

const browser = await chromium.launch();
try {
  for (const { path, svg, size } of outputs) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
    });
    await page.setContent(
      `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`,
    );
    await page.screenshot({ path, omitBackground: true });
    await page.close();
    console.log(`wrote ${path}`);
  }
} finally {
  await browser.close();
}
