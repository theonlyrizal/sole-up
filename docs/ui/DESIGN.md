# SoleUp design direction

**Revision 3 · 2026-11-08.** This is a short entry point. Exact tokens live in [DESIGN_SYSTEM.md](DESIGN_SYSTEM.md); page layouts in [SCREENS.md](SCREENS.md); color composition and satisfying feedback in [EXPERIENCE_DESIGN.md](EXPERIENCE_DESIGN.md).

## A clear morning, a satisfying mark

An airy lake-blue canvas, substantial white surfaces, tactile weekday capsules, bold useful figures, and stable personal colors. Small peach confirmations make saved actions feel tangible. Material 3 Expressive provides the shapes, typography, color roles and motion language.

- **Direction:** lake blue — light primary `#26638B`, dark primary `#98CCF9`.
- **Atmosphere:** mist `#CBE6FF` above light canvas `#F5FAFF`; dark counterparts come from the full role table.
- **Content:** opaque white in light mode; deliberately layered dark surfaces in dark mode.
- **Identity:** six stable container palettes; life-area colors retain their existing meaning.
- **Confirmation:** peach `tertiary-container`, local and brief; green success for saved/working status.
- **Typography:** Google Sans Flex for UI, Geist Mono for code. Use semantic type tokens.
- **Shape:** 28–32 px major cards, 16 px fields, pill actions and day capsules. Shape varies by function.
- **Response:** immediate activation, honest pending, confirmed save, recoverable failure. Progress rests at its true value on first paint.

Use paired role colors, 4.5:1 minimum normal-text contrast, 3:1 large-text and required non-text contrast, visible focus, full keyboard access and reduced motion. Color reinforces labels and patterns.

The previous lime/Inter mini-spec is superseded. It contradicted the full plan and had incomplete light/dark role pairing. This file must not become a parallel token source again.
