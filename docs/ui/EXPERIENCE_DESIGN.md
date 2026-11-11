# SoleUp: the experience should feel worth returning to

**Revision 4 · 2026-11-12.** Use with SCREENS, COMPONENTS and the role pairs in DESIGN_SYSTEM. Example figures describe test fixtures.

<!-- Hallmark design review for the specification: Philosophy 5 / Hierarchy 5 / Execution 4 / Specificity 5 / Restraint 5 / Variety 5. -->

## 1. Creative direction

Use warm neutral space, substantial opaque cards, and shapes that help people recognise what they can do. Give each page a distinct composition. Home uses a featured commitment and small browseable tiles. Today favours action rows. Track makes time visible through three different chart geometries. Calendar uses a compact date picker beside its denser schedule. Review ends with a focused sheet.

The references use large figures with small units, soft corners, inset date circles, and visible status marks to direct attention. [The reference guide](README.md#the-reference-images) traces those components to their SoleUp uses.

## 2. Colour composition

| Layer | Treatment |
|---|---|
| Canvas and content | Cream `canvas` in light mode, with opaque `resting-surface` cards. Use paired text roles for titles and metadata. Home, landing and sign-in can use the shallow `canvas-mist` wash. |
| Primary action and data | Forest `primary` for primary actions, links, current day capsules and actual progress. |
| Secondary action | Kiwi `secondary` for tonal buttons and selected filters. Use the quieter `secondary-container` for large or recurring surfaces such as the navigation indicator and time blocks. |
| Featured content | One `feature-surface` focal module on Home. Use the same Crisp Carrot family for a compact Now chip or a thin `feature-ink` line with the current time. |
| Rewards and highlights | Sunshine `reward-container` for search marks and Review finish art. Use `confirmation-surface` for brief feedback after a saved log. Persistent saved/working indicators use the success roles. |
| Promotions and alerts | Tomato Burst for an actual promotion or actionable warning, with a label and the relevant icon. Use the dedicated error roles for validation failures and destructive actions. |
| Identity | Use the area or identity container on a 40–56 px avatar, a chip or a short leading accent. Keep each entity's colour stable across routes through the shared `entityType + ':' + id` helper. |

| Page | First emphasis | Supporting treatment |
|---|---|---|
| Home | Crisp Carrot next-commitment card, or Today when the commitment is absent | Forest calendar action and current date. Opaque habit tiles with personal avatars |
| Today | Forest primary action and current date | Kiwi Done shortcut on otherwise neutral habit rows |
| Track | Forest history fill and current-day outline | Personal identity tile and brief Sunshine feedback |
| Goals | Goal name and area, with a Forest milestone arc on detail | Compact counts in overview and neutral history |
| Calendar | Forest current-date marker and selected day | Kiwi time blocks and Crisp Carrot Now marker. Quiet grid and empty time |
| Review | Period and step label | Sunshine finish art after a confirmed save |
| Notes/Search | Opaque writing and result surfaces | Sunshine marks on matched text |
| Settings | Quiet groups and theme preview | Kiwi selection and green working status |
| Landing/Sign-in | Forest primary action and opaque surfaces | Small shape composition in the landing hero |

In dark mode, preserve the same visual hierarchy with the paired roles in DESIGN_SYSTEM. Dark cards lift by tone. Check both sparse and dense screens for readable supporting text and clear boundaries.

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
| Confirmed success | The affected day/segment moves from its current value to the confirmed value with default spatial motion. The control's icon becomes a check with a fast spatial response. A Sunshine confirmation halo appears behind that icon for 600 ms, fading with effects easing. Label becomes Done or the existing quantity summary |
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

Give the commitment card 20 px padding on compact and 28 px on wider screens. Use a small kind label, a 24–28 px title with natural wrapping, time as supporting information, and a clearly labelled Forest calendar action. At most one low-contrast decorative shape may sit in an empty corner; it must disappear when the title grows into that space. Place the Now chip near the time, not floating over the art.

Today leads with the planned count. Due and needs-a-decision appear as labelled secondary links. Each count stands on its own because the categories can overlap. If there is no next commitment, Today becomes the focal Crisp Carrot card and the absence of a commitment is a quiet line/link. Keep all metric definitions accessible.

Habit previews use opaque, square-proportioned tiles with a 48 px identity shape, up to two title lines, and a row of real weekly unit marks above the full count caption. Keep the full title in the link’s accessible name and allow the card to grow at larger text settings. Use 176–208 px tiles in a horizontal snap list on compact and a grid on expanded. Show a partial next tile when more items are available, and give the list visible, keyboard-accessible Previous and Next controls when it overflows.

### Today: feel actionable rather than demanding

Keep task rows aligned and quiet. Place the checkbox first, the task title next, and context beneath; optional actions follow. Dates and priority are supporting information. Use whitespace and grouping, not a different card color for every task. A title can wrap; never shrink it to protect a badge. Completed feedback stays local. Earlier-task headings remain neutral, and no decorative completion ring implies the whole day has a score.

### Track: make the record beautiful enough to inspect

A habit card leads with its name and cadence, then makes the time scale visible. Week mode shows seven tall Forest day pills, four-week mode uses circular numbered cells, and twelve-week mode uses a matrix of small rounded squares. Identity color appears in its avatar and a small context chip, never as a competing chart scale. Separate title/cadence, record, and figure with 12–16 px gaps. Display the range near the range control and keep each habit's figure adjacent to its chart.

The empty and paused states deserve equal care: neutral cells with legible labels, a useful Resume/Create action, and the same quality of spacing. Do not fade an entire paused card to illegibility. A newly saved day receives the local response in §4; a missed day receives no animation.

**Small-width fit:** a four-week row must not assume a 390 px viewport. Within card padding at 320–375 px, use a locally scrollable grid with a visible overflow affordance when seven full targets cannot fit. Never shrink the hit targets or allow document-wide overflow. A 28 px matrix dot is a visual mark, not a 28 px touch target: provide non-overlapping 48 px interactive cells, using local overflow when required. Week labels remain associated with each row. Non-loggable marks are static. Full date and state remain available by keyboard and assistive technology.

### Goals: outcomes with texture, not a wall of gauges

Overview rows/cards lead with the goal name and life-area chip. Reserve the large segmented arc for detail; overview uses a small textual milestone count or compact progress treatment. The detail arc, title, status and reason form one coherent header. Put the next action immediately after that header. Do not push actual work below a large decorative illustration. A zero-count milestone set shows a deliberate empty state with Create milestone, never an empty ring.

### Review: a warm ending to a focused sequence

Use the period and four-step navigation as a clear scaffold; prompts sit on neutral surfaces. Warmth arrives at the saved finish sheet: 72 px soft-burst art on a Sunshine container, saved heading, editable-until date and one wide Forest Done action on compact. The sheet does not advertise another habit or initiate another review. History stays neutral and readable.

### Calendar and forms

The date picker pairs a row of month chips with circular day buttons. A Forest fill marks the selected date. A ring and current-date semantics identify today. When both states fall on the same date, keep the fill and a contrasting inset ring. Keep dates visible over any hatch and preserve keyboard navigation when the grid scrolls locally.

Present existing Calendar start and end controls as a labelled pair. Stack the fields on compact and place them side by side when both labels and values fit. Keep optional scheduling, reminder and link fields in their existing groups. Compact full-screen forms put the primary submit button in an opaque sticky footer above the safe area and keyboard, with scroll room for the final field and its error.

### Notes, Settings and public pages

Keep the writing surface quiet. Search matches use the paired Sunshine container and foreground. Settings pairs a useful theme preview with clear selected controls. Public and sign-in screens use a Forest action and accurate product copy. The landing page uses one expressive shape composition.

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

Capture Home with and without a commitment, Today, Track week/4w/12w, Calendar’s date picker and event form, goal detail, Review finish, Notes and Settings in light and dark. Use representative seeded records and both short and long titles. Check 320, 375, 390, 414, 768 and 1280 px widths; use 390 × 844 and 1280 × 800 for the existing phase screenshot set. Include 200% text sizing and reduced motion. Screenshots cannot prove feedback timing: exercise mutations in a browser as well.

For each changed action, verify successful, pending, failed, repeated and corrected states using the existing test fixtures/mocking boundaries. Slow a request to observe pending, reject it to observe rollback, then retry. Reuse existing behavioral tests; add targeted coverage only for new behavior, not tests that merely repeat CSS token values.

### Review rubric (0 = absent, 1 = weak, 2 = convincing)

| Dimension | A convincing implementation |
|---|---|
| Hierarchy | First question and primary action are clear without reading all copy |
| Character | Warm canvas, opaque surfaces, tactile day shapes and personal identity feel coherent |
| Color | Featured, secondary, reward and alert roles are distinct. Paired text, functional marks and focus pass contrast |
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
| UI-1 | Light/dark colour roles and aliases in DESIGN_SYSTEM §§1 and 13, plus the stable identity helper |
| UI-2a/b | Show paired button and banner roles, compact sticky form footer, accessible overflow and local confirmation states in the gallery |
| UI-3 | Consistent selected navigation and page framing; no replaying page entrances |
| UI-4 | Home focal fallback, honest Today count treatment, stable colorful habit tiles |
| UI-5/6 | Stable task feedback and focus; distinguish saving/saved/error without new domain behavior |
| UI-7 | Quiet grid, distinct selected/today states, Now marker, month chips and paired start/end fields |
| UI-8 | Goal identity, restrained overview, confirmed milestone arc changes |
| UI-9 | All three range compositions, accessible grids, confirmed local log response and rollback |
| UI-10 | Warm saved finish; strict explicit-success trigger |
| UI-11 | Quiet writing and save status, readable search matches |
| UI-12 | Theme previews, meaningful selected states and coherent public entry |
| UI-13 | Rubric and cross-route identity, timing, accessibility and state review |

Agents implement the part their phase owns. Where the backend cannot support a requested figure or action, retain the honest existing behavior and document a separate proposal. Never invent a denominator, a completion event, or a visit history to fill a visual.
