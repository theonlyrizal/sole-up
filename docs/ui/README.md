# SoleUp UI redesign

**Status:** Redesign plan. Revision 3 experience refinement, 2026-11-08; builds on revision 2 (2026-10-30). Delivery status remains in the UI phase tracker; this revision does not claim implementation has shipped.
**Track:** A separate delivery track, UI-0 to UI-13, run alongside the product chunks in [`../IMPLEMENTATION_PLAN.md`](../IMPLEMENTATION_PLAN.md).

SoleUp gets a full frontend redesign. It follows **Google Material 3 Expressive**, adapted for an accessible, responsive Next.js PWA, and takes its visual direction from five reference images (described below). The backend stays as it is: the tables, services, Server Actions, queries, URL contracts and domain rules don't change. Pages, layouts and presentation components can be rebuilt from scratch.

## Reading order

| # | Document | What it settles | Who reads it |
|---|---|---|---|
| 1 | [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) | Numbered decisions (D-01 …), each with its reason and the alternatives turned down: what we take from each reference, what we refuse, navigation, theme, fonts, icons and the product-rule boundaries | Everyone, before any phase |
| 2 | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Exact tokens: colour roles (hex values, light and dark, with measured contrast), life-area palette, type scale, shape scale, spacing, elevation, state layers, motion springs as CSS `linear()`, breakpoints, icon and shape library, content style | UI-1 onwards |
| 3 | [COMPONENTS.md](COMPONENTS.md) | Each shared component's anatomy, sizes, variants, states, props and accessibility contract | UI-2 onwards |
| 4 | [SCREENS.md](SCREENS.md) | Every route, screen by screen: wireframes for compact and expanded widths, which existing query field fills each element, states, interactions, and what must stay unchanged | The phase that owns the screen |
| 5 | [UI_AUDIT.md](UI_AUDIT.md) | The current routes, data sources, URL contracts, states, tests, and which components to reuse or replace | Before touching a route |
| 6 | [UI_IMPLEMENTATION_PLAN.md](UI_IMPLEMENTATION_PLAN.md) | Phases UI-0 to UI-13: scope, files, tasks, tests, done criteria, tracker and handoff notes | The agent running a phase |
| 7 | [UI_AGENT_PROMPTS.md](UI_AGENT_PROMPTS.md) | One prompt to paste per phase | The user |
| 8 | [EXPERIENCE_DESIGN.md](EXPERIENCE_DESIGN.md) | Reference analysis, page color recipes, interaction psychology, exact feedback sequences, small-screen treatments and a scored acceptance rubric | Every implementing agent |

Read EXPERIENCE_DESIGN after DESIGN_DECISIONS, before implementing a phase. Its revision 3 rules supersede older instructions for color composition, first-load progress animation, confirmation timing, Home's no-commitment treatment, and interactive chart hit targets. Otherwise the more specific document wins: SCREENS beats COMPONENTS, COMPONENTS beats DESIGN_SYSTEM, and DESIGN_SYSTEM beats DESIGN_DECISIONS. Product rules in DESIGN_DECISIONS §2 always win. `CLAUDE.md`, `PRODUCT_SPEC.md`, the ADRs and `DATA_MODEL.md` outrank this folder. DESIGN.md is a summary, not a second token source.

## The reference images

The user supplied five images, available under `C:/Users/salma/OneDrive/Pictures/` in this order: `f3f347e3364375fcb6f45914e2a47f5b.webp`, `0fcc227f93ff5dc63057479f2dcf6d42.webp`, `ba921a8a6090d5cd34f2f425b313f78b.webp`, `91ea10867b5993f1b84acae438dca09e.webp`, and `original-ab2beaa32cff35b3e6601ff36741fac4.webp`. They are third-party portfolio shots, so **they are not committed to the repository**. The descriptions below and EXPERIENCE_DESIGN's extraction table let an agent work without those machine-local files.

1. **Blue "habit" app, three phones, tilted grid (primary reference).**
   - **Background and surfaces:** a pale sky-blue background with soft clouds; white rounded cards (about 28–32 px corners) floating above it.
   - **Header:** a monogram/avatar with "Today's Habit" and a circular menu button.
   - **Week strip:** a horizontal strip of seven day chips (weekday letter above the date) inside tall pill capsules. Today is a filled deep-blue capsule with a white inner circle around the date.
   - **Activities carousel:** square white tiles, each with a 3D illustration and a label.
   - **"Activity Steps" card:** a big number ("4.256 / Steps"), a 0…target scale, and a row of about 26 thin vertical pills, deep blue up to the progress point and pale steel-blue after it. Three pills below: two filled (time, energy) and one outlined.
   - **Navigation and calendar:** a four-item bottom bar (Home, Progress, Calendar, Profile) with filled icons for the active item. A month chip row (Feb, Mar, **Apr**, May) above a month grid of circular day cells; selected days are filled, ranges are joined by a tinted band, and out-of-month days are hatched.
2. **Same app, hero composition.**
   - The home screen in hand against a misty mountain lake, plus close-ups of the "Activity Steps" card and the "Progress Goal 78 %" card.
   - The goal card shows a thick semicircle gauge in three parts: a filled deep-blue arc, a pale arc, and a diagonally hatched arc for the remainder. A large light-weight numeral sits in the middle with a muted caption.
3. **Same app, three screens straight on.**
   - **Progress screen:** a "Favorite Habits" card with a Monthly dropdown and five tall rounded bars for Mon–Fri. The other days are hatched pale blue; Thursday is solid deep blue with the activity icon at its foot and a rotated "+83 %" label.
   - **Calendar screen:** a "Habit List" of rows, each with an icon tile, a title, metadata (a clock icon with "45 minute", a pin icon with "City Park"), and a filled "Start" pill button.
4. **Orange "streak" app.**
   - **Header and texture:** a warm orange gradient header, "Good Morning J.Snow / Keep the streak alive", a flame-count chip, and a dot-matrix heatmap texture (rows of small rounded squares in three orange intensities).
   - **Celebration:** a white bottom sheet with a drag handle, a large outlined flame, "Congrats!".
   - **Streak detail:** a week row of filled flame circles, a "60 Days Streaks Goal | 27 Days Completed" split stat, and "12 Hours Well Spent".
   - **Edit form:** labelled field containers (a small coloured label above the value), a start/end date pair joined by a dotted connector, a reminder switch row, and a bottom action row with a wide gradient "Save" button and square icon buttons for refresh and delete.
5. **Blue/pink glass app.**
   - **Onboarding:** "Maintain Daily Habit" with a product photo.
   - **Home:** "Good Day 👋" with a segmented donut ring showing 78 % beside a legend (Sleep, Walking, Cycling). Below it, a wavy-edged gradient panel holds "Todays Habits" cards with a check status and time, and a bottom bar with a raised centre "+" button.
   - **Add Habit form:** a grid of activity icons in circles (the selected one filled), a goal slider with a value bubble ("5 km"), and a glossy "Add Habit" button.

DESIGN_DECISIONS §3 turns these into a pattern catalogue: what we take, how it maps onto SoleUp's real data, and what we refuse (fake fitness metrics, life scores, streaks, trophies, glossy gradients on controls).

## Material 3 Expressive sources

Token values in DESIGN_SYSTEM.md were checked on 2026-10-30 against Google's own Jetpack Compose Material 3 token sources (`androidx/compose/material3/tokens/*.kt`): motion springs (`ExpressiveMotionTokens`, `StandardMotionTokens`), corner scale (`ShapeTokens`), navigation bar and rail sizes (`NavigationBarTokens`, `NavigationRail*Tokens`). The guideline site is <https://m3.material.io/>. SoleUp builds its **own** React components on these tokens with Tailwind CSS 4 and Radix. It does not use `@material/web`, MUI, or any Android library (D-03).

## What changed from revision 1

### Revision 3: experience refinement (2026-11-08)

- Added EXPERIENCE_DESIGN: page-specific color composition, stable personal identity, rewarding feedback, calm return journeys, and explicit implementation ownership.
- Reconciled the conflicting lime mini-spec in DESIGN.md with the lake-blue Material plan.
- Replaced first-view progress spectacle with feedback tied to real saved changes; specified pending, failure, retry and correction.
- Added Home's focal fallback and honest count treatment, accessible small-screen chart layouts, and a review rubric for the agents.
- Psychology is stated as design hypotheses to validate, without unsupported claims about addiction or universal color effects.

### Revision 2

- Concrete values everywhere: colours, contrast ratios, sizes, motion curves and wireframes, instead of directions to "tune later".
- Facts corrected: chunk 8.4 (Search, `/notes/search`) **has shipped**; revision 1 called it unbuilt.
- Tests are back in scope. Revision 1 told agents not to add or run tests. That conflicts with `CLAUDE.md` ("Definition of done" and "Never fake completion"), so every phase now updates and runs the relevant checks.
- New documents: COMPONENTS.md and SCREENS.md.
- The phases are split smaller: Plan is now Today plus the task lists, and public and system pages have a phase of their own.
