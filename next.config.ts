import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Playwright runs its own dev server (playwright.config.ts). It needs its
  // own build folder: Next refuses a second `next dev` on the same one, so
  // tests can run while `pnpm dev` is up.
  distDir: process.env.SOLEUP_NEXT_DIST_DIR || ".next",
  // The document CSP uses a fresh nonce, which must also be in the HTML.
  // Cache Components would reuse a partially prerendered HTML shell.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=()",
          },
          ...(process.env.NODE_ENV === "production"
            ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
            : []),
        ],
      },
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
