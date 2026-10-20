import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright runs its own dev server (playwright.config.ts). It needs its
  // own build folder: Next refuses a second `next dev` on the same one, so
  // tests can run while `pnpm dev` is up.
  distDir: process.env.SOLEUP_NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
