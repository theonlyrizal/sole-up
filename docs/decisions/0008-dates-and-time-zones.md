# 0008: Dates and time zones library

**Date:** 2026-10-20
**Status:** Accepted

## Context
Chunk 0.9 needs `todayFor(tz)` and conversions between local dates, wall-clock times and UTC instants (ADR 0004). The plan asked for one time-zone library, chosen after checking the state of `Temporal`. On 2026-10-20: Temporal reached TC39 Stage 4 (ES2026) in March 2026 and ships in Chrome/Edge 144+, Firefox 139+ and Node 26, but not in stable Safari or in Node 24, which this project runs (`engines.node ^24.19.0`).

## Decision
Use the Temporal API through **`temporal-polyfill`** (FullCalendar, MIT, 1.0.5 pinned), imported as a module (`import { Temporal } from "temporal-polyfill"`), not installed as a global. Only `src/lib/dates.ts` imports it; the rest of the app uses its helpers. Local dates are `YYYY-MM-DD` strings, instants are `Date`, zones are IANA names. DST ambiguity follows Temporal's `"compatible"` disambiguation.

## Alternatives considered
- **`date-fns` v4 + `@date-fns/tz`:** smaller and tree-shakable, but `TZDate` is a `Date` subclass where local dates and instants are easy to mix up, and DST gap handling is implicit.
- **`@js-temporal/polyfill`:** the reference polyfill; last released March 2025 and larger.
- **Luxon:** mature, but a non-standard API and last released 2025.
- **Native Temporal only:** not available on Node 24 or Safari.

## Consequences
- When Node (LTS) and Safari ship Temporal, replace the import in `src/lib/dates.ts` with the global and drop the dependency; no caller changes.
- Server and browser can spell a zone differently (Node 24's ICU says `Asia/Calcutta`, browsers `Asia/Kolkata`). Validation canonicalizes with the server's `Intl`, and the UI matches the browser's zone to the server's option list.
