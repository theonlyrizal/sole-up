# SoleUp redesign decisions

**Status:** Proposed design direction for implementation planning; no UI code changed by this document.
**Date:** 2026-10-30

## 1. Product reading

SoleUp is a connected personal management workspace. Its promise is helping a person decide what matters, make a realistic plan, follow through, and review what happened. It is not a fitness-only tracker and not a gamified productivity scorecard.

The redesign must support the shipped and planned domains: Home, goals and life areas, tasks and calendar, habits, notes, weekly review and insights, preferences, reminders, privacy, export, and account controls. It should make the connected model visible: tasks can serve goals; notes can link to goals and tasks; time blocks reserve time for tasks; Home and Review summarize explainable stored activity.

The source of truth for feature behavior is the existing product specification, data model, ADRs, and implementation. A visual redesign must not silently alter their semantics. In particular:

- No composite life score, streak counter, leaderboard, or shame-oriented treatment of missed work.
- Show definitions, date ranges, and missing-data states alongside metrics; use the existing metrics and query logic.
- Planning is adjustable. Rescheduling and pausing are normal decisions, not failures.
- User agency and privacy remain visible in any future insights or AI features.
- Calendar, habit, review, reminder, note, and time-zone behavior must preserve the corresponding ADR.

## 2. Reference synthesis

The primary visual direction comes from images 1–3: pale blue/aqua context, white cards with generous rounded corners, deep blue selected states, clear date strips, calm analytical visuals, and a bottom navigation pattern suited to phones. Image 4 contributes a small warm orange accent and the use of a focused celebration state. Image 5 contributes vivid identity for activities and simple progress visualization.

Translate those cues into SoleUp's domain rather than reproducing their fitness dashboard. The palette is primarily blue and mist; warm amber/coral is a secondary signal for habit completion, reminders, and occasional positive feedback. Illustrations are optional accents, never the only way to identify a feature or understand a metric. Use real user data and existing metrics; do not reuse the sample step totals, percentage score, fictional profile, or workout content pictured in the references.

Do not use a full-bleed photographic or cloudy background behind content. The reference's atmosphere can become a subtle low-contrast aqua page wash or small decorative shape behind an introductory area, with opaque surfaces preserving text contrast. Avoid persistent gradients on every component, blur that reduces legibility, or decoration that competes with a user's work.

## 2a. Current UI diagnosis from the supplied screenshots

The four screenshots are evidence of the current SoleUp UI, not design instructions embedded in the images. They show the application in dark mode. The redesign must retain a well-crafted dark theme, while also making the light theme the default visual expression of the supplied blue/aqua references unless the user's saved/system preference selects dark.

Observed problems to address:

- **Home:** every summary is presented as a nearly identical full-width outlined panel. Titles, primary values, explanatory copy, metric definitions, date range, and calculation time compete at the same visual level. Empty cards consume as much attention as populated ones. A long vertical stack delays the useful answer to “what should I do next?”
- **Track:** the page begins with multiple controls and a large legend before the habit content. Each habit repeats a long calculation explanation. The week matrix is cramped; dates, weekdays, status marks, history and actions compete in each row. The page is visually dense and the card boundary between habits is not strong enough for scanning.
- **Weekly review:** the period selector, past-review link, four equal step tabs, step counter, heading, and metric cards all appear at once. Every metric repeats its full definition/range, causing a long page with little hierarchy. Reflection should feel like a guided, calm flow, not a report wall.
- **Settings:** all sections appear as a long narrow form with little information architecture. Inputs and explanatory copy have weak grouping, and the user's most common preference changes compete with device/reminder controls.
- **Across pages:** a dark surface and outline are doing most of the design work. There is little meaningful contrast between primary actions, secondary actions, selected states, and content groups. Cards look like generic containers, not a purposeful system. Repeated explanatory text is technically transparent but visually overwhelming.

Required resolution: preserve metric transparency while reducing its visual dominance. Each metric needs a clear primary label/value, one short human explanation in the main view, and its range/as-of in a quiet but readable secondary line. Put the full counting rule behind a labelled “How this is counted” disclosure or contextual details affordance, retaining screen-reader access. Do not remove a definition, but do not repeat a paragraph in every card by default.

Home should use a strong first-screen hierarchy and responsive card grid; Track should present one habit as a compact, clearly separated unit with a legible history strip; Review should progressively disclose one step at a time and summarize metrics compactly; Settings should use grouped sections and clear save boundaries. Every surface must still show actionable errors, save/conflict state, and meaningful empty states.

## 3. Material 3 Expressive interpretation

Use Material 3 Expressive as the design-system foundation, adapted for the browser and PWA:

- Semantic color roles and tonal surface hierarchy, with light and dark themes.
- A clear type scale with a few intentional emphasized moments rather than oversized headings everywhere.
- A deliberate shape vocabulary, including rounded cards, pills for compact status/selection, and expressive shape only for meaningful moments.
- Motion that communicates selection, completion, expansion, and navigation; use short spring-like easing where it helps and respect reduced-motion preferences.
- Adaptive layouts and components that use available width well on phones, tablets, and desktop.
- Accessible touch targets, keyboard operation, focus visibility, contrast, and non-color status cues.

Google's current Material site calls the system **Material 3 Expressive**. Its web guidance does not provide parity for every Expressive component, so implement a SoleUp component and token layer using the existing React/Tailwind/Radix stack. Do not add a large component framework simply to claim conformance. Keep semantics, native controls where suitable, and Radix behavior for accessible complex controls.

## 4. Information architecture

### Desktop

Keep a persistent navigation rail/sidebar with direct destinations for **Home, Plan, Goals, Track, Notes, Review**, and **Settings**. Plan retains its contextual links for Today, Upcoming, Calendar, Inbox, and All tasks. Goals retains Life Areas and archived goals; Track retains archived habits; Notes retains search, tags, and archived notes; Review retains past reviews and Insights when that phase ships. Put account identity and sign out at the rail's lower edge. Provide a clear page title and contextual primary action in the content area.

### Mobile

Use a compact top app bar and a four-destination bottom navigation: **Home, Plan, Track, More**. More opens a clearly labelled, accessible destination surface for Goals, Notes, Review, and Settings. Keep page-specific subnavigation near the page title (Today/Upcoming/Calendar/Inbox within Plan) rather than trying to put every route in the bottom bar. Keep the primary action easy to reach without covering content or the system home indicator.

This is a deliberate change from the current seven-item mobile grid, which gives each destination too little room. It keeps common daily use visible and groups less frequent destinations without removing them. Validate this choice in responsive browser review and a keyboard walkthrough.

### Home

Home remains a concise, explainable overview, not a replacement for detailed domain pages. Prioritize today's commitments and decisions, then next commitment, deadlines, goal next actions, and per-habit summaries using existing metric definitions. Use responsive two-column cards on wide screens and a readable single column on phones. Do not create a score or imply more certainty than the data supports.

### Page behavior

Keep existing routes and URL-backed filters. Page-level subnavigation and filters should remain discoverable and shareable. Keep detail views focused on one entity with linked context (goal tasks/milestones/notes, task schedule/notes, habit history, review evidence). Use dialogs for focused create/edit decisions; use inline actions for quick reversible logging and status changes. Destructive actions retain confirmation.

## 5. Visual and interaction decisions

- **Canvas:** soft neutral with a subtle cool tint; cards use opaque tonal surfaces.
- **Primary accent:** deep blue/blue-teal. **Secondary accent:** soft aqua. **Warm accent:** amber/coral reserved for habit activity and a few positive moments, never error states.
- **Shape:** generous but controlled corner radii, with hierarchy between cards, dialogs, buttons, fields, and compact chips. Avoid making every control a capsule.
- **Elevation:** use surface tone and restrained shadow; separate content primarily through spacing and tonal contrast.
- **Typography:** preserve Geist initially; map it to a documented semantic type scale. If a later font change is proposed, compare legibility, loading, and language coverage before adopting it.
- **Data display:** prefer small bars, weekly strips, timelines, and calendars already backed by real data. Label metric meaning and range. Charts must have readable text equivalents and cannot rely on color alone.
- **Feedback:** show clear pending, saved, success, empty, and recoverable error states. Keep habit log undo and note save/conflict behavior.
- **Motion:** use motion for feedback and continuity, not decoration. Disable or reduce nonessential motion when `prefers-reduced-motion` is set.
- **Responsive layout:** design around content, with a readable max-width for forms and long text, and richer multi-column layouts only when space supports them.
- **Accessibility:** semantic headings and landmarks; labelled controls; visible focus; keyboard-operable menus/dialogs/calendar interactions; adequate contrast; touch targets; status conveyed in text/icons as well as color.

## 6. Scope boundaries

This is a UI/UX redesign and may replace the frontend presentation substantially. Agents may add, remove, split, consolidate, or rewrite page and component files when that makes the experience clearer. They must trace imports and remove obsolete components only when unused. They should read user data through existing authenticated server queries/actions and existing backend tables; no browser-direct database access, duplicate client-side business rules, fake data, or unscoped endpoints. Preserve server authorization, user scoping, schemas, audit/privacy boundaries, and existing service/domain behavior. Do not add fake demo values, remove meaningful definitions, break deep links, weaken accessibility, or replace working domain-specific flows with static mockups.

The visual result should be a genuine redesign, not just token recoloring. Component structure, page composition, interaction patterns, and information hierarchy may all change while route and domain contracts remain stable.

The first implementation should establish shared foundations and shell, then redesign representative high-traffic pages and reuse the resulting patterns across the remaining domains. Existing feature work in phases 8.4–10 is still pending; coordinate visual work with those features rather than claiming their UI exists.

## 7. Design risks and how to resolve them

| Risk | Direction |
| --- | --- |
| Seven destinations crowd a phone bar | Use four destinations and a labelled More surface; verify every route remains reachable and keyboard accessible. |
| Reference images normalize fake fitness metrics | Reuse visualization forms only where SoleUp has real, defined data. |
| Soft backgrounds reduce contrast | Keep content surfaces opaque and test contrast in both themes. |
| Rounded cards create visual clutter | Use whitespace and tonal hierarchy; reserve strong color and large shapes for a few focal moments. |
| “Expressive” becomes decorative motion | Tie animation to state changes and respect reduced motion. |
| Broad redesign breaks domain behavior | Preserve route/query contracts, Server Actions, data semantics, and existing integration/E2E coverage. |

