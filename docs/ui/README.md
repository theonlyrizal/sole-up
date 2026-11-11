# SoleUp UI redesign

**Status** — Revision 4, 2026-11-12. This is the design specification for the UI-0 to UI-13 delivery track. See the phase tracker for implementation status.

SoleUp's visual language combines a Cream canvas, Forest Green controls, and varied components for planning, habit history and reflection. The five attached images inform component shape, hierarchy and layout. [DESIGN.md](DESIGN.md) gives a short overview, and [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md#1-colour) defines the six brand colours and their light/dark roles.

## Reading order

| # | Document | What it settles | Who reads it |
|---|---|---|---|
| 1 | [DESIGN_DECISIONS.md](DESIGN_DECISIONS.md) | Numbered decisions (D-01 …), reference patterns, navigation, theme, fonts, icons and product rules | Everyone, before any phase |
| 2 | [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md) | Exact tokens: colour roles (hex values, light and dark, with measured contrast), life-area palette, type scale, shape scale, spacing, elevation, state layers, motion springs as CSS `linear()`, breakpoints, icon and shape library, content style | UI-1 onwards |
| 3 | [COMPONENTS.md](COMPONENTS.md) | Each shared component's anatomy, sizes, variants, states, props and accessibility contract | UI-2 onwards |
| 4 | [SCREENS.md](SCREENS.md) | Every route, screen by screen: wireframes for compact and expanded widths, which existing query field fills each element, states, interactions, and what must stay unchanged | The phase that owns the screen |
| 5 | [UI_AUDIT.md](UI_AUDIT.md) | The current routes, data sources, URL contracts, states, tests, and which components to reuse or replace | Before touching a route |
| 6 | [UI_IMPLEMENTATION_PLAN.md](UI_IMPLEMENTATION_PLAN.md) | Phases UI-0 to UI-13: scope, files, tasks, tests, done criteria, tracker and handoff notes | The agent running a phase |
| 7 | [UI_AGENT_PROMPTS.md](UI_AGENT_PROMPTS.md) | One prompt to paste per phase | The user |
| 8 | [EXPERIENCE_DESIGN.md](EXPERIENCE_DESIGN.md) | Reference analysis, page color recipes, interaction psychology, exact feedback sequences, small-screen treatments and a scored acceptance rubric | Every implementing agent |

Read EXPERIENCE_DESIGN alongside SCREENS and COMPONENTS for composition and feedback. DESIGN_SYSTEM owns colour values and role pairs. DESIGN_DECISIONS §2, the product spec, the ADRs and the data model govern product behaviour.

## The reference images

1. **Habit dashboard collage.** Borrow the tall weekday capsules, square activity tiles, oversized count and rounded progress marks. Use them for Home's date navigation, habit previews and real weekly progress.
2. **Activity and goal close-ups.** Borrow the number/unit hierarchy and thick segmented arc. Use countable milestones on goal detail, with the count visible inside the arc.
3. **Home, Progress and Calendar screens.** Borrow the contrast between tall day bars, circular month dates, and compact icon/title/action rows. Apply those shapes to Track's weekly chart, Calendar's date picker, and Today's habit list.
4. **Streak detail and edit sheets.** Borrow the bottom-sheet hierarchy, dot matrix, split figures, paired date fields and wide footer action. Apply them to real habit history, the Review finish sheet, Calendar event fields and compact forms.
5. **Habit onboarding, overview and form.** Borrow a single-action introduction, clear selection in an option grid, and a leading status glyph in action rows. Apply them to the landing page, the life-area swatch picker and habit rows. Use the existing numeric stepper for quantity targets.

[DESIGN_DECISIONS §3](DESIGN_DECISIONS.md#3-reference-pattern-catalogue) maps these details to SoleUp data. [EXPERIENCE_DESIGN §5](EXPERIENCE_DESIGN.md#5-screen-art-direction-compositions-agents-must-deliver) specifies where each component belongs.

## Material 3 Expressive sources

Token values in DESIGN_SYSTEM.md were checked on 2026-10-30 against Google's own Jetpack Compose Material 3 token sources (`androidx/compose/material3/tokens/*.kt`): motion springs (`ExpressiveMotionTokens`, `StandardMotionTokens`), corner scale (`ShapeTokens`), navigation bar and rail sizes (`NavigationBarTokens`, `NavigationRail*Tokens`). The guideline site is <https://m3.material.io/>. SoleUp builds its **own** React components on these tokens with Tailwind CSS 4 and Radix. It does not use `@material/web`, MUI, or any Android library (D-03).

## Revision history

### Revision 4 · 2026-11-12

- Defined the six-colour SoleUp palette, light and dark role pairs, and contrast for foregrounds and functional marks.
- Refined the Home focal card and habit tiles, Track's three history views, Calendar's date picker, compact forms, and the Review finish sheet using the reference components.
- Aligned the screen specs, component specs, implementation phases and paste-ready prompts.

### Revision 3: experience refinement (2026-11-08)

- Added EXPERIENCE_DESIGN: page-specific color composition, stable personal identity, rewarding feedback, calm return journeys, and explicit implementation ownership.
- Consolidated the design overview and token reference.
- Replaced first-view progress spectacle with feedback tied to real saved changes; specified pending, failure, retry and correction.
- Added Home's focal fallback and honest count treatment, accessible small-screen chart layouts, and a review rubric for the agents.
- Psychology is stated as design hypotheses to validate, without unsupported claims about addiction or universal color effects.

### Revision 2

- Concrete values everywhere: colours, contrast ratios, sizes, motion curves and wireframes, instead of directions to "tune later".
- Facts corrected: chunk 8.4 (Search, `/notes/search`) **has shipped**; revision 1 called it unbuilt.
- Tests are back in scope. Revision 1 told agents not to add or run tests. That conflicts with `CLAUDE.md` ("Definition of done" and "Never fake completion"), so every phase now updates and runs the relevant checks.
- New documents: COMPONENTS.md and SCREENS.md.
- The phases are split smaller: Plan is now Today plus the task lists, and public and system pages have a phase of their own.
