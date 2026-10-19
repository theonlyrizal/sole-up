# SoleUp AI and Personalization Strategy

**Status:** Strategy for phased implementation. No custom model training is planned.

## 1. Objective

Use intelligence to make SoleUp more useful by interpreting a user's goals, plans, preferences, and history. The objective is not to imitate a person for its own sake. It is to provide relevant, grounded decision support while preserving user control.

## 2. Guiding principle

**Use conventional code for facts and calculations; use AI for interpretation, language, and uncertain trade-offs.**

Examples:
- Calculate task completion rate in application code.
- Determine whether a deadline has passed using stored dates and defined rules.
- Use a model to help explain possible blockers or draft reflection questions from selected evidence.
- Never let a model invent a completion record or silently change a user's goal.

## 3. Phased capabilities

### Phase 0: No AI

Build reliable structured records and deterministic insights:
- Goal inactivity.
- Upcoming deadlines.
- Habit consistency.
- Workload summaries.
- Planned-versus-completed comparisons where data supports them.
- Weekly review template.

### Phase 1: AI-assisted review

Generate a draft weekly review using selected, relevant records:
- Highlights grounded in completed work.
- Goals that have had little recent activity.
- Workload and deadline concerns.
- Questions about blockers.
- A short list of possible adjustments.

The user reviews and edits the result. The system should label uncertainty and avoid asserting causes without evidence.

### Phase 2: User-controlled memory

Introduce visible memory items with:
- Type and source.
- Date created and last confirmed.
- Confidence or uncertainty where meaningful.
- Controls to inspect, correct, reject, supersede, and delete.
- A clear distinction between user-stated facts and system-generated hypotheses.

Ask before saving important inferred preferences or sensitive information.

### Phase 3: Personalized planning

Use confirmed preferences and observed history to suggest realistic plans:
- Typical available time windows.
- Preferred task sizes.
- Preferred reminder style.
- Historical completion patterns.
- Active constraints and priorities.

Recommendations remain editable and require confirmation before changing commitments.

### Phase 4: Proactive assistance

Only after users trust the feature and can control it:
- Daily briefing.
- Stalled-goal alerts.
- Overload warnings.
- Review reminders.
- User-configured accountability messages.
- Optional adaptive reminders.

Proactive interventions must be configurable, rate-limited, and easy to disable.

### Phase 5: Behavioral prediction research

Consider only if validated user needs justify it. Start with transparent statistical baselines and evaluate calibration, bias, usefulness, and failure costs before complex modeling. Do not assume a “digital twin” is necessary.

## 4. Conceptual intelligence pipeline

```text
User request or scheduled review
          |
          v
Identify purpose and permitted data
          |
          v
Retrieve relevant records and memories
          |
          v
Compute deterministic summaries
          |
          v
Construct minimal context
          |
          v
LLM provider adapter
          |
          v
Schema validation and safety checks
          |
          v
Evidence-linked suggestions
          |
          v
User accepts, edits, rejects, or ignores
          |
          v
Optional feedback updates preferences/memory
```

## 5. Memory categories

Keep categories explicit:

- **Explicit fact:** directly stated by the user.
- **Preference:** a preference the user has expressed or confirmed.
- **Observation:** a pattern calculated from records.
- **Hypothesis:** a possible explanation that may be wrong.
- **Current context:** a time-bound circumstance, commitment, or constraint.
- **Aspiration:** a stated desired identity or future outcome.

Do not collapse a user's aspirations into assumptions about their current behavior. Do not turn one event into a permanent personality label.

## 6. Evidence and uncertainty

Every substantive recommendation should ideally identify the evidence that motivated it, for example:
- “This goal has had no recorded action for 18 days.”
- “You scheduled 12 hours of tasks but completed 6 estimated hours last week.”
- “You marked this reminder as unhelpful three times.”

Avoid unsupported statements such as “You are afraid of success” or “You always self-sabotage.” The model should ask or frame possible explanations as hypotheses.

## 7. Provider and cost strategy

- Use an existing model API rather than training a foundation model.
- Keep provider code behind an adapter.
- Do not call the model on every interaction.
- Trigger model calls for high-value workflows such as a weekly review or explicit user request.
- Use deterministic summaries and retrieve only relevant context.
- Set token, latency, and monetary limits.
- Cache results only when the data context and retention policy make caching safe.
- Provide a no-AI fallback and clear error states.
- Review the provider's data-retention, training, and regional processing terms before sending personal data.

## 8. Data minimization

Before sending context to an external model:
1. Define the task and why each field is needed.
2. Exclude unrelated notes and sensitive records.
3. Prefer summaries and references over full raw content.
4. Redact credentials and unnecessary identifiers.
5. Make the feature's data use understandable to the user.
6. Avoid retaining prompts and outputs unless needed.
7. Ensure users can disable AI features.

## 9. Boundaries and prohibited behavior

The AI must not:
- Claim to be the user or to possess their identity.
- Present a prediction as a fact.
- Manipulate users through guilt, shame, fear, or manufactured intimacy.
- Encourage dependence on the assistant as the user's only source of support.
- Make medical, legal, or financial determinations beyond appropriate general assistance.
- Autonomously take consequential external actions.
- Delete or modify important records without confirmation.
- Execute arbitrary model-generated code or database queries.
- infer sensitive personal attributes as permanent facts from weak signals.
- hide the basis for a consequential recommendation.

## 10. Evaluation

For each AI feature, evaluate:
- Groundedness in supplied records.
- Factual error rate.
- Usefulness as rated by users.
- Rate of unsupported psychological claims.
- User correction/rejection rate.
- Latency and cost.
- Privacy incidents and inappropriate data disclosure.
- Whether users can understand why a recommendation appeared.

Test cases should include sparse data, contradictory records, changed goals, missing history, model outage, malicious note content, and cross-user data isolation.

## 11. Prompt-injection and untrusted content

User notes and imported text may contain instructions intended to manipulate the model. Treat such content as data, not authority. System instructions and application policy must remain separate from retrieved user content. Never let retrieved content grant permissions or authorize external actions.

## 12. First recommended AI feature

Build an **AI-assisted weekly review** only after the core review data is available.

Input:
- Selected period.
- Active goals and their recent activity.
- Completed, overdue, and rescheduled task summaries.
- Habit logs and defined cadence.
- User-provided review preferences.
- A small set of relevant, approved memories if memory exists.

Output:
- Evidence-backed highlights.
- Items needing attention.
- Questions for reflection.
- A few suggested adjustments.
- Uncertainty notes.

The output is a draft. The user remains responsible for deciding what to change.
