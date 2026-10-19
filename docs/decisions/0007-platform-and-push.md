# 0007: Platform and push

**Date:** 2026-10-20
**Status:** Accepted

## Context
The spec left open whether the first platform is responsive web, PWA or native, and which calendar and reminder features belong in the MVP. Reminders must reach the user when no tab is open.

## Decision
- **Platform:** a responsive web app, installable as a PWA. No native app in v1.
- **Reminders:** delivered via Web Push from the server-side worker ([0003](0003-hosting-and-jobs.md)). What can remind, defaults, quiet hours and payload content are decided at the Phase 5 decision gate, keeping ARCHITECTURE.md §8's rule of no sensitive content in previews by default.
- **Calendar and reminders are in the MVP**, as their own phases after the core loop (Goals → Today). Calendar v1 is internal events only, with no external calendar sync. Recurring events, time blocks and which views ship are decided at the Phase 4 decision gate (recommended: no recurring events or time blocks in v1; week and agenda views).

## Alternatives considered
- **Native mobile (React Native/Expo):** better notifications, but a second codebase before the product is proven.
- **Email reminders:** needs an email provider; kept as a later fallback.
- **Deferring calendar and reminders past the MVP:** recommended initially, but the developer wants them for real daily use.

## Consequences
- iOS Web Push requires the PWA to be installed to the home screen (iOS 16.4+); this must be explained in the UI.
- Needs VAPID keys, a service worker and push subscription storage (deleted with the account).
- Delivery must be idempotent and tested around time zones and DST.
