import type { Metadata, Viewport } from "next";
import { Geist_Mono, Google_Sans_Flex } from "next/font/google";
import { headers } from "next/headers";
import { ServiceWorkerRegistration } from "@/components/pwa/service-worker-registration";
import { CANVAS_COLORS, themeInitScript } from "@/lib/theme";

import "./globals.css";

const googleSansFlex = Google_Sans_Flex({
  variable: "--font-sans",
  weight: "variable",
  axes: ["ROND", "opsz", "wdth", "GRAD"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
  fallback: ["ui-sans-serif", "system-ui", "sans-serif"],
});

const geistMono = Geist_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SoleUp",
  description:
    "Decide what matters, plan realistic next steps, and review your progress.",
};

/** Browser chrome color, matching the canvas per theme. */
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: CANVAS_COLORS.light },
    { media: "(prefers-color-scheme: dark)", color: CANVAS_COLORS.dark },
  ],
  // Lets the bottom bar extend under a phone's home indicator; the bar
  // pads itself with env(safe-area-inset-bottom).
  viewportFit: "cover",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Use the nonce from the same request policy Next.js uses for its scripts.
  const policy = (await headers()).get("content-security-policy");
  const nonce = policy?.match(/'nonce-([^']+)'/)?.[1];
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${googleSansFlex.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: themeInitScript() }}
        />
      </head>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <ServiceWorkerRegistration />
      </body>
    </html>
  );
}
