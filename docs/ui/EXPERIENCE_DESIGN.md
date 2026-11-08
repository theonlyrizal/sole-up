# SoleUp: the experience should feel worth returning to

**Revision 3 · 2026-11-08 · Implementation specification.** Read alongside SCREENS and COMPONENTS. This document refines their visual treatment and feedback; it does not change domain calculations, routes, or backend contracts. Example figures below describe test fixtures, never production defaults.

<!-- Hallmark · pre-emit critique: Philosophy 5 / Hierarchy 4 / Execution 4 / Specificity 5 / Restraint 4 / Variety 5. Planning assessment; rendered implementation still needs visual review. -->

## 1. Creative direction: a clear morning, a satisfying mark

SoleUp should feel airy when opened, tactile when touched, and reassuring after an action. The defining composition is **mist around the content, crisp white underneath it, lake blue for direction, personal colors for recognition, and a small warm response when effort becomes a saved record**.

The user's request for a more addictive interface is implemented as an appealing, repeatable usefulness loop: notice something meaningful → take one easy action → see that it worked → leave with a clear next step. Success means people willingly return to their plans and trust their records. Session length, compulsive checking, and notification volume are not success measures.

### What the reference images contribute

| Reference detail | Why it is visually compelling | SoleUp execution |
|---|---|---|
| Pale blue atmosphere, thick white cards | Strong figure/background separation with breathing room | A mist wash confined to the upper canvas; solid cards; one large focal module, then smaller supporting surfaces |
| Tall weekday capsules with inset date circles | Repeated, touchable shapes establish a recognizable rhythm | Seven evenly spaced capsules, one filled today; date remains legible at small widths; calendar navigation stays explicit |
| Large numeral with small baseline unit | A useful answer can be scanned before reading explanatory text | One principal count per module, unit beside it, period below; never a giant unexplained percentage |
| Rounded progress strokes | Progress reads as tangible marks rather than a spreadsheet | Actual expected units in habit progress and countable milestones in a goal arc; no decorative progress on task counts |
| Warm orange celebration and dot texture | Warmth contrasts with the cool surroundings | A brief peach accent at the changed control; a warm Review finish composition; day matrices display actual logs |
| Blue/pink activity identity | Personal items are easier to distinguish | Stable teal, violet, pink, amber, blue and green avatar containers; labels always carry the meaning |
| Layered sheets and wide action buttons | The next action feels reachable and contained | Opaque elevated sheets, 28 px top corners, one wide primary action; no information under translucent layers |

The screenshots do not establish exact fonts, colors, or numerical ratios. The chosen tokens are SoleUp's interpretation, not sampled claims about the source files.

## 2. Color choreography

Use the existing DESIGN_SYSTEM palette. Do not add another brand palette or change the hue on each page. Color has four jobs: orient, identify, confirm, and decorate. One element must not perform all four at once.

### Layer recipe

1. **Canvas:** `canvas`, with the existing `canvas-mist` wash within the first 360 px. Add no mist behind the Notes writing body or the Calendar time grid.
2. **Resting content:** `surface-container-lowest`, paired with `on-surface`; use `on-surface-variant` for metadata. Cards remain opaque.
3. **Focal content:** one `primary-container` module per viewport, paired with `on-primary-container`. It gets the strongest numeral or title and the clearest action.
4. **Personal identity:** area/identity container colors appear on a 40–56 px avatar, an area chip, or one short leading accent. Keep the chart's semantic fill blue.
5. **Action confirmation:** `tertiary-container` with `on-tertiary-container`, local to the changed control. Stable saved/working indicators use success roles.

**Composition targets, not mechanical pixel quotas:** roughly three quarters of visible content should remain quiet surfaces and space; the focal tint should occupy around one sixth; identity and warm accents share the remainder. A large chart or a dense calendar is an exception. At a glance, there must be an obvious focal region and generous neutral space. Do not count pixels to satisfy this rule.

### Page treatments

| Page | Focal treatment | Supporting color | What stays quiet |
|---|---|---|---|
| Home | Lake-blue next commitment; when absent, Today gets the focal treatment | Personal habit avatars; peach Now chip only when actually under way | Goals needing action and deadlines |
| Today | Blue selected day and primary create action; white task rows | Identity chips connect tasks to their goals | Earlier and needs-a-decision groups use neutral surfaces |
| Track | White habit cards; blue history and today outline | A colored identity tile per habit; brief peach confirmation | Paused/inactive days remain readable neutrals |
| Goals | White overview grouped by area; one blue arc on detail | Life-area chips and identity tiles | Descriptions and audit history |
| Calendar | Blue today marker and selection | Existing area labels/swatches where data supplies them; peach Now marker | Grid, empty time and navigation chrome |
| Review | Blue period heading; peach finish panel only after saving | A small violet identity motif in the heading, without implying a new metric | Prompts, textareas and history |
| Notes/Search | White writing canvas and neutral result groups | Violet page icon; peach search matches | Editor toolbar and note content |
| Settings | Quiet grouped surfaces with a live theme preview | Blue selected setting and green verified working status | Secondary instructions |
| Sign-in/Landing | Lake-blue focal action, mist and one expressive shape composition | One pink or teal decorative shape, never competing CTAs | Provider names, errors and required disclosures |

Use named aliases in DESIGN_SYSTEM §13. Never set an entire card's text in a saturated identity color. Never tint every row a different pastel. An entity keeps its avatar color across Home, Track, selectors, and linked contexts. Hash `entityType + ':' + id` once in a shared pure helper; never hash its title or array position. Renaming/reordering must not change identity. Goals with a life-area color continue to use it.

### Dark mode is another composition

Keep the same hierarchy and color meanings. Use the dark role pairs, opaque panels, and a low-contrast mist. No white glow, neon outer shadow, or inverted illustrations. A warm confirmation remains peach/brown, never a bright orange flash. Review both a nearly empty page and a dense page; dark mode must retain surface separation without relying on shadows.

## 3. Interaction psychology, expressed as testable design choices

These are design hypotheses, not promises about dopamine, universal color meanings, or scientifically guaranteed retention gains. Color associations differ by person and culture.

| Principle | Concrete choice | Evidence to inspect |
|---|---|---|
| Recognition over recall | Stable entity avatar, name, area and contextual action appear together | A renamed habit retains identity; linked tasks show the goal name |
| Visible system status | Press response, pending state, confirmed state and failure each look different | A slow/failed mutation never looks permanently saved |
| Clear choice | One primary action per module; secondary options in an accessible menu | A person can point to the next action without reading every paragraph |
| Chunking | Group by day, area, cadence or review step using existing data | Group headings explain the collection; no arbitrary groups of three |
| Proximity and continuity | Feedback appears where the action happened; focus stays with it | The user does not search for a new row or jump to a global toast |
| Visible progress toward an actual target | A saved log fills the corresponding day/expected unit; a milestone fills its segment | The numeral, caption and geometry agree with the server result |
| Agency and reversibility | Existing Undo/Clear/Edit/Pause remain easy to reach | Correction is possible after any temporary snackbar disappears |
| Completion and closure | A short confirmation and a deliberate resting state follow the action | The interface allows the user to finish without manufacturing another task |

Sources for the usability principles: [NN/g: recognition versus recall](https://www.nngroup.com/articles/recognition-and-recall/) and [NN/g: visibility of system status](https://www.nngroup.com/articles/visibility-system-status/). Material role naming follows [Google's color roles](https://m3.material.io/styles/color/roles). The color allocation, timings, and page recipes here are product design decisions to validate in SoleUp.

### The returning-user loop

**Open:** show the saved local date, today's recognizable capsule and the next real commitment. **Choose:** offer one direct route to Today's tasks or the relevant habit. **Act:** keep the existing quick log/create flow short. **Confirm:** make the change visible in its original context. **Close:** show a truthful calm state and let the person leave.

After a gap, use the same helpful entry point. Do not infer a missed streak, show a backlog warning modal, or ask the user to repair a history before using today. Existing earlier-task groups remain available. This behavior is achievable from existing data and requires no visit tracking.

## 4. The satisfying action: exact feedback choreography

All durations reference DESIGN_SYSTEM §7 springs and effects. Do not add a second motion library. The times below describe event order, not a forced network delay. On a fast response skip unnecessary pending animation; never wait for an animation before submitting or allowing navigation.

### Habit Done / quantity saved

| Stage | Visual and interaction contract |
|---|---|
| Pointer/key activation | State layer responds immediately; pointer-only inner icon may compress to 0.96. Keep the target and label fixed. Keyboard gets the same state feedback without a spatial nudge |
| Request in progress | Use the existing optimistic hook. Mark the control `aria-busy`; prevent duplicate submissions for this entity only. Optimistic history fills may update, but no success burst or Saved announcement yet |
| Confirmed success | The affected day/segment moves from its current value to the confirmed value with default spatial motion. The control's icon becomes a check with a fast spatial response. A peach confirmation halo appears behind that icon for 600 ms, fading with effects easing. Label becomes Done or the existing quantity summary |
| Rest | Halo disappears. The saved check/fill remains. No card bounce, layout shift, scrolling, or replay on refresh |
| Failure | Roll back using the existing hook; retain entered quantity; show the existing error and retry. Restore the prior visual state, announce failure, and run no celebration |
| Undo/correction | Use the existing inverse mutation if offered. Keep pending/error handling and animate toward the returned value. Never celebrate Undo as another achievement |

For quantity habits, the bar fill is capped by the existing engine's credit. Show the actual amount as text; do not exaggerate the fill for values above the target. A partial quantity save gets confirmation, not an implied full-target achievement. Updating the same log to the same value never replays the halo.

**Reduced motion:** omit scale, halo, drawn checks and animated fills. Change the saved state immediately with the same text and announcement. No audio or vibration dependency. Do not add browser vibration or sound permissions.

### Other actions

| Action | Satisfying response | Failure/limit |
|---|---|---|
| Complete task | Check settles into the checkbox; current row remains visually traceable through refresh | No optimistic success if the existing mutation has none. Do not add a fake delayed removal; keep focus safe if it disappears |
| Save goal/milestone | Existing saved state and changed milestone segment are visible | Arc stays at the previous value until confirmed; never animate a completion merely because a goal page opened |
| Change date/filter | Selection indicator settles with fast spatial motion; content updates through existing URLs | No full-page entrance or resetting scroll without a navigation reason |
| Add task/habit/note | New item uses its stable identity; brief local highlight only when its returned ID is known and visible | No duplicate ghost record or celebration on an autosave retry |
| Note autosave | Quiet Saving → Saved status; no repeated toast or halo for each keystroke | Failure and conflict remain persistent and actionable |
| Finish review | Existing success sheet with a warm shape, saved message and editable-until date | Only open after explicit Finish succeeds. Never on hydration, opening a past review, or editing an already completed review |
| Pause/archive/delete | Clear confirmation of the actual outcome | No celebratory shape or warm burst on removal; preserve consequences and recovery behavior |

### Motion budget

One action produces one local emphasis. A day fill and a check may coordinate; the whole card, page header and snackbar must not all bounce. Use effects easing for color/opacity, spatial easing for transforms. The halo has no animated blur, no particles, no infinite loop, and no glow outside its icon container.

Progress and metrics render their true values on initial load. **No zero-to-value count-ups, viewport-triggered bar fills, or staggered progress reveal.** This supersedes COMPONENTS' original first-view animation instruction for `SegmentedPillBar`. Reserve interpolation for a user-triggered data change on the current screen. Loading indicators alone may loop and must stop when work stops.

## 5. Screen art direction: compositions agents must deliver

### Home: an inviting dashboard with a useful first screen

At 390 × 844, use a compact greeting (not a marketing headline), the week capsules, one focal commitment card and the beginning of Today. Header + week strip + focal card should target 400 px or less excluding the OS/browser chrome, without truncating a long title. The primary action should be visible before scrolling on this representative viewport. At larger text settings allow natural growth.

Commitment card: 24 px inner padding, a small kind label, a 24–28 px title with natural wrapping, time as secondary information, and a clearly labelled calendar action. At most one low-contrast decorative shape may sit in an empty corner; it must disappear when the title grows into that space. Place the Now chip near the time, not floating over the art.

Today: the planned count is the figure; due and needs-a-decision are secondary links with labels. These categories can overlap and have no completion denominator. Never render them as segments of a progress bar. If there is no next commitment, Today becomes the focal blue card and the absence of a commitment is a quiet line/link. Keep all metric definitions accessible.

Habit previews: white 176–208 px tiles, a 48 px identity shape, up to two title lines, real weekly unit marks, and their full caption. Preserve a reachable complete title when clamped. On compact use a horizontal snap list with a small next-tile preview; on expanded use a grid. No autoplay or forced swipe tutorial. Avoid a tall carousel consuming the whole first viewport.

### Today: feel actionable rather than demanding

Keep task rows aligned and quiet. Place the checkbox first, the task title next, and context beneath; optional actions follow. Dates and priority are supporting information. Use whitespace and grouping, not a different card color for every task. A title can wrap; never shrink it to protect a badge. Completed feedback stays local. Earlier-task headings remain neutral, and no decorative completion ring implies the whole day has a score.

### Track: make the record beautiful enough to inspect

The visual anchor of a habit card is its real record: blue rounded day pills in week mode, date cells in four-week mode, a matrix in twelve-week mode. Identity color appears in its avatar and a small context chip, never as a competing chart scale. Separate title/cadence, record, and figure with 12–16 px gaps. Display the range near the range control and keep each habit's figure adjacent to its chart.

The empty and paused states deserve equal care: neutral cells with legible labels, a useful Resume/Create action, and the same quality of spacing. Do not fade an entire paused card to illegibility. A newly saved day receives the local response in §4; a missed day receives no animation.

**Small-width fit:** a four-week row must not assume a 390 px viewport. Within card padding at 320–375 px, use a locally scrollable grid with a visible overflow affordance when seven full targets cannot fit. Never shrink the hit targets or allow document-wide overflow. A 28 px matrix dot is a visual mark, not a 28 px touch target: provide non-overlapping 48 px interactive cells, using local overflow when required. Week labels remain associated with each row. Non-loggable marks are static. Full date and state remain available by keyboard and assistive technology.

### Goals: outcomes with texture, not a wall of gauges

Overview rows/cards lead with the goal name and life-area chip. Reserve the large segmented arc for detail; overview uses a small textual milestone count or compact progress treatment. The detail arc, title, status and reason form one coherent header. Put the next action immediately after that header. Do not push actual work below a large decorative illustration. A zero-count milestone set shows a deliberate empty state with Create milestone, never an empty ring.

### Review: a warm ending to a focused sequence

Use the period and four-step navigation as a clear scaffold; prompts sit on neutral surfaces. Warmth arrives at the saved finish sheet: 72 px soft-burst art, peach container, saved heading, editable-until date, one Done action. The sheet does not advertise another habit or initiate another review. History stays neutral and readable.

### Notes, Calendar and Settings: restraint supports satisfaction

The writing surface has no moving decoration. Search highlights are readable peach marks, not fluorescent full-row fills. Calendar's dense data needs pale grid lines and clear selection rather than large decorative capsules within every event. Settings has a useful theme preview and clean selected controls; saved confirmation is enough. Public/sign-in screens inherit the same palette and shape language with accurate product copy, never sample stats or invented testimonials.

## 6. Copy at the moment it matters

| Context | Use | Avoid |
|---|---|---|
| Confirmed check log | Existing Done label; one concise saved announcement | “You're unstoppable”, “Keep the streak alive” |
| Partial quantity | Actual amount + unit, existing target label | “Goal completed” when only partly logged |
| No commitment | “Nothing coming up in the next 30 days” with the existing calendar action | “You're falling behind” or “Your day is complete” |
| Returning user | Local date and ordinary greeting | Claims about how long they have been away |
| Finished review | “Your review is saved” + real editable-until date | Trophy, streak or invented insight |
| Autosave problem | Existing error, retained draft, Retry | A transient toast as the only evidence of failure |

Reuse domain labels/definitions exactly. New decorative captions are optional; cut any line that repeats a heading. Avoid patronizing praise and generic motivational quotes. The user's own goal title and reason are the most personal content on the screen.

## 7. Acceptance: the experience must survive real states

Capture Home, Today, Track week/4w/12w, goal detail, Review finish, Notes and Settings in light and dark. Use representative seeded records and both short and long titles. Check 320, 375, 390, 768 and 1280 px widths; use 390 × 844 and 1280 × 800 for the existing phase screenshot set. Include 200% text sizing and reduced motion. Screenshots cannot prove feedback timing: exercise mutations in a browser as well.

For each changed action, verify successful, pending, failed, repeated and corrected states using the existing test fixtures/mocking boundaries. Slow a request to observe pending, reject it to observe rollback, then retry. Reuse existing behavioral tests; add targeted coverage only for new behavior, not tests that merely repeat CSS token values.

### Review rubric (0 = absent, 1 = weak, 2 = convincing)

| Dimension | A convincing implementation |
|---|---|
| Hierarchy | First question and primary action are clear without reading all copy |
| Character | Mist, opaque surfaces, tactile day shapes and personal identity feel coherent |
| Color | Focal tint is deliberate; text pairs pass contrast; personal colors remain stable |
| Response | Activation, pending, saved, error and correction are distinguishable |
| Truthfulness | Every figure, fill, label and confirmation agrees with available data |
| Accessibility | Keyboard, zoom, small screens and reduced motion retain the experience |
| Restraint | A user can finish; there is no replaying spectacle or pressure |
| Variety | Notes, Track, Goals and Calendar serve different tasks with distinct compositions |

Require at least 13/16, with no zero and full scores for truthfulness and accessibility before a phase's visual review passes. This is a review tool, not an empirically validated quality metric. Attach the scored rationale, screenshots and unresolved items to the handoff. Any unresolved accessibility/data correctness failure blocks acceptance regardless of the total.

If trying the design with users, ask them to find the next commitment, log/correct a habit, identify a saved state, and resume after a gap. Record observed confusion and voluntary comments. Validate the hypothesis that the interface feels inviting; do not claim a retention improvement without evidence. No new analytics or personal-content logging is authorized by this plan.

## 8. Implementation ownership

| Phase | Required delivery from this document |
|---|---|
| UI-1 | Role aliases from DESIGN_SYSTEM §13; stable identity helper; motion tokens reused |
| UI-2a/b | Local confirmation primitive and gallery states; readable hit targets and local overflow; no success effect on mount |
| UI-3 | Consistent selected navigation and page framing; no replaying page entrances |
| UI-4 | Home focal fallback, honest Today count treatment, stable colorful habit tiles |
| UI-5/6 | Stable task feedback and focus; distinguish saving/saved/error without new domain behavior |
| UI-7 | Calm grid, clear selection/Now and date picker; no decorative event data |
| UI-8 | Goal identity, restrained overview, confirmed milestone arc changes |
| UI-9 | All three range compositions, accessible grids, confirmed local log response and rollback |
| UI-10 | Warm saved finish; strict explicit-success trigger |
| UI-11 | Quiet writing and save status, readable search matches |
| UI-12 | Theme previews, meaningful selected states and coherent public entry |
| UI-13 | Rubric and cross-route identity, timing, accessibility and state review |

Agents implement the part their phase owns. Where the backend cannot support a requested figure or action, retain the honest existing behavior and document a separate proposal. Never invent a denominator, a completion event, or a visit history to fill a visual.
