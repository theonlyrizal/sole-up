import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright runs its own dev server (playwright.config.ts). It needs its
  // own build folder: Next refuses a second `next dev` on the same one, so
  // tests can run while `pnpm dev` is up.
  distDir: process.env.SOLEUP_NEXT_DIST_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  async headers() {
    return [
      {
        // public/sw.js. Always revalidated, so a new version reaches
        // browsers on their next visit, and it may load nothing from
        // anywhere else.
        source: "/sw.js",
        headers: [
          {
            key: "Content-Type",
            value: "application/javascript; charset=utf-8",
          },
          {
            key: "Cache-Control",
            value: "no-cache, no-store, must-revalidate",
          },
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self'",
          },
        ],
      },
    ];
  },
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
