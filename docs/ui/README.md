# SoleUp UI redesign

This folder defines the product and visual decisions for a full SoleUp UI/UX redesign. It considers both the original blue/aqua reference set and the later screenshots of SoleUp's current Home, Track, Review, and Settings screens. The current screenshots expose content hierarchy, repeated explanations, density, and navigation problems; the earlier reference set defines the intended modern visual direction. Read the documents in this order:

1. [Design decisions](DESIGN_DECISIONS.md) — product interpretation, visual direction, information architecture, and constraints.
2. [Design system](DESIGN_SYSTEM.md) — tokens, component behavior, layout rules, accessibility, and responsive behavior.
3. [Implementation plan](UI_IMPLEMENTATION_PLAN.md) — phased, reviewable delivery plan grounded in the current app.
4. [Agent prompts](UI_AGENT_PROMPTS.md) — ready-to-use prompts for implementing one phase at a time.

These are design and implementation planning documents, not a record that the redesign has already shipped. The existing feature behavior, routes, domain rules, server actions, and data model remain the source of truth while the UI changes.

## Context reviewed

The plan reflects `docs/PRODUCT_SPEC.md`, `docs/ROADMAP.md`, `docs/IMPLEMENTATION_PLAN.md`, `docs/ARCHITECTURE.md`, `docs/DATA_MODEL.md`, and ADRs 0010–0016. As of 2026-10-30, the progress log records implementation through 8.3 as done; 8.4–8.5 and phases 9–10 are still todo. The current app uses Next.js 16.4 App Router, React 19, Tailwind CSS 4, Radix UI, and FullCalendar 7.1, with an authenticated desktop sidebar/mobile bottom bar, CSS-variable tokens, and feature-specific pages.

## Visual references

The five images supplied in the request are inspiration, not product specifications. Their shared cues are soft blue/aqua atmosphere, white elevated surfaces, rounded containers, bold readable metrics, compact weekly calendars, clear navigation, and friendly activity illustrations. One image uses a separate orange streak aesthetic; SoleUp will use a restrained warm accent for habit activity and positive feedback while retaining one coherent blue/aqua product palette. Avoid copying invented sample user names, sample metrics, fitness-only labels, or streak pressure.

The references remain at the user-provided paths:

- `C:/Users/salma/OneDrive/Pictures/f3f347e3364375fcb6f45914e2a47f5b.webp`
- `C:/Users/salma/OneDrive/Pictures/0fcc227f93ff5dc63057479f2dcf6d42.webp`
- `C:/Users/salma/OneDrive/Pictures/ba921a8a6090d5cd34f2f425b313f78b.webp`
- `C:/Users/salma/OneDrive/Pictures/91ea10867b5993f1b84acae438dca09e.webp`
- `C:/Users/salma/OneDrive/Pictures/original-ab2beaa32cff35b3e6601ff36741fac4.webp`

They are not copied into the repository. The first, second, and third are the primary direction; the fourth contributes only the warm, celebratory accent; the fifth contributes the compact progress visualization and colorful activity identity, interpreted in SoleUp's calmer tone.

## Material references

- [Material 3 Expressive overview](https://m3.material.io/): Google's overview of expressive color, typography, motion, shape, and components.
- [Material 3 getting started](https://m3.material.io/get-started): design foundations and platform availability.
- [Material 3 lists](https://m3.material.io/components/lists/overview): component guidance and current expressive/web support status.

Material 3 Expressive is adapted to an accessible responsive web application. Use Material concepts and roles; do not imply that SoleUp uses Google's Android Compose implementation.
