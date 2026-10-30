# SoleUp Material 3 Expressive design system

This document translates [the design decisions](DESIGN_DECISIONS.md) into implementation rules. It is a product-specific web adaptation of Material 3 Expressive, not a claim of using the Android component library.

## Foundations

### Semantic color roles

Implement semantic CSS custom properties in `src/app/globals.css`, mapped to Tailwind v4 theme utilities. Components consume semantic roles rather than hard-coded palette values.

| Role | Use |
| --- | --- |
| `background` | App canvas; softly cool neutral. |
| `surface`, `surface-container`, `surface-high` | Cards, grouped sections, dialogs, and raised controls. |
| `foreground`, `foreground-muted` | Main and supporting text. |
| `primary`, `on-primary`, `primary-container`, `on-primary-container` | Main actions, selected navigation, and key highlights; blue/blue-teal family. |
| `secondary`, `on-secondary`, `secondary-container` | Supporting aqua accents and secondary emphasis. |
| `tertiary`, `on-tertiary`, `tertiary-container` | Restrained warm accent for habit/activity warmth and occasional celebration. |
| `outline`, `outline-variant` | Focusable boundaries, separators, and subtle edges. |
| `error`, `on-error`, `error-container` | Errors only; never use the warm success/celebration accent for errors. |
| `success` | Confirmed completion, paired with an icon or explicit label. |
| `focus` | High-visibility keyboard focus ring. |

Define light and dark values with tested text/background pairings. Keep blue identity in dark mode without using low-contrast muted blue text. Do not derive a user's dynamic system palette in phase one; stable product colors make the visual identity predictable.

#### Starting palette direction

These are initial design targets sampled from the reference direction, not final accessible role values. Generate/adjust tonal roles from them, then inspect each actual foreground/background pairing in both themes before shipping:

- Primary seed: deep clear blue around `#2F6F91`.
- Secondary seed: calm aqua/blue-green around `#5A9297`.
- Tertiary seed: restrained warm amber/coral around `#C96F49`.
- Light canvas direction: cool near-white around `#F2F7F7`; main card surface near `#FFFFFF`.
- Dark canvas direction: blue-black around `#10191C`; raised surface around `#192528`.
- Status/error colors are separate semantic roles and must not be borrowed from the celebratory accent.

These approximations should be tuned as a coherent tonal scheme, not pasted as isolated CSS values. Confirm at least WCAG AA contrast for normal text, meaningful focus indication, and readable muted copy before choosing final values. Avoid making every card the same white; use subtle surface tonal roles for hierarchy.

### Typography

Keep the existing Geist family for the first pass and define semantic roles: `display`, `headline`, `title`, `body`, `label`, and `metric`. Use tabular numerals for aligned counts when supported. Keep body and label sizes comfortably readable; use display/headline roles sparingly for page titles, a primary Home moment, or a meaningful completion state. Avoid italic/light-gray copy for required metric definitions.

### Shape, spacing, and elevation

Use a 4px base spacing unit with common steps 4, 8, 12, 16, 24, 32, 40, and 48px. Use 16px minimum page gutters on phones, 24px on tablet, and 32px on desktop. Set authenticated content to a comfortable max width around 1200px; keep forms and long text around 640–760px. Don't stretch every screen to the full viewport just because space exists.

Define a compact shape scale: 12px for compact controls, 16px for fields/menus, 24px for primary cards/dialogs, and full rounding only for status pills/avatars and intentionally circular icon buttons. Use 16px minimum internal card padding, with 20–24px for major content cards. Cards should not need a border and heavy shadow at the same time; use tonal layering, then a subtle shadow only for floating surfaces. Avoid reducing focus outlines or hit areas to make layouts look lighter.

Use responsive behavior around these target widths (adapt when content requires it): below 768px, phone shell and single-column forms; 768–1023px, compact rail and flexible 1–2 column layouts; 1024px and above, expanded sidebar and full responsive grids. The nav shell may transition earlier/later when the available content column would become too narrow.

### Motion

Create a small set of CSS timing/easing tokens for state changes: quick feedback around 120ms, standard transition around 200ms, and emphasized spring-like movement around 300ms. Use for selected navigation, expansion, completion feedback, and opening surfaces only. Do not animate large dashboard sections on every render. Under `prefers-reduced-motion: reduce`, remove nonessential transforms and transitions while preserving state feedback.

## Component contracts

Build on the existing `src/components/ui` primitives, Radix UI, Tailwind, and HTML semantics. Consolidate variant and size rules in shared components instead of adding page-local design dialects.

- **Button:** filled primary, tonal/secondary, outlined, text/ghost, and destructive variants; clear focus/disabled/loading states; comfortable touch size; icon buttons require an accessible name.
- **Text fields:** visible labels, supporting/error text wired with `aria-describedby`, clear focus, and errors not conveyed by color alone.
- **Navigation:** desktop rail with icon and label; mobile bottom navigation with four labelled destinations; current destination indicated by shape/tone plus `aria-current`; More destination opens a labelled menu/sheet.
- **Touch targets:** aim for at least 44×44 CSS pixels for primary mobile controls and calendar/habit date cells; keep visible spacing between destructive and safe actions.
- **Cards:** heading and content hierarchy; actions are contextual; avoid nesting interactive cards or placing multiple competing primary actions in one card.
- **Metric cards:** value, definition, date range/as-of context, and an actionable link where available; distinguish `hasData: false` from a numeric zero.
- **Status chips:** concise status with text and an optional icon. Do not encode state solely by color.
- **Dialogs/sheets:** retain Radix focus management, Escape behavior, focus restoration, accessible title/description, and safe mobile viewport sizing. Use a bottom sheet only when its drag/close affordance remains accessible.
- **Lists:** meaningful row labels, supporting context, consistent leading/trailing action placement, visible separators only as needed, and a clear empty state.
- **Calendar/timeline:** preserve keyboard navigation, timezone semantics, date labels, all-day/timed distinctions, and color-independent event identity. Keep FullCalendar/the custom area views behavior intact while theming.
- **Charts/strips:** provide textual value and definition; use patterns or labels alongside color; charts are supplementary, never the sole source of information.
- **Toasts:** short-lived confirmation for reversible actions and undo where supported; errors that require action stay visible in the page/dialog.
- **Loading/empty/error:** reuse shared visual language and preserve page structure where possible to reduce layout shift.

## Layout and breakpoints

- **Small phone:** one-column content, compact top app bar, four-item bottom navigation, full-width primary action where useful, dialogs that fit the viewport.
- **Large phone/tablet:** allow two-column card grids when each card retains readable measure and actions; navigation can transition to a rail when there is adequate width.
- **Desktop:** persistent sidebar and bounded content width. Use multi-column layouts for overview and calendar only where they improve scanning; forms and long text remain narrower.
- Respect `safe-area-inset-*` for fixed navigation and floating actions. Content must scroll behind neither a persistent bar nor a keyboard.
- Reuse the app's route groups, loading/error boundaries, and URL-backed filters. Keep the authenticated shell server-rendered where possible; interactive navigation and controls remain small client components.

## Quality bar

Every redesigned page must retain loading, empty, success, and error feedback relevant to that flow; pass keyboard operation and axe checks already present; work in light and dark modes; preserve mobile safe areas; and keep existing data definitions and authorization boundaries. Do not add tests or execute a verification suite unless the user asks for tests/verification; when implementation prompts are used, they may specify the necessary test expectations as work to be delivered.

