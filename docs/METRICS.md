# Metrics

The server metrics module calculates figures from each user's records. Every metric returns a value, a plain-language definition, a range, and `hasData`. Dates in the range are inclusive local calendar dates in the user's time zone. A null bound leaves that end open. `asOf` records when the calculation ran. Historical figures can change when source records or settings change.

## Home

| Metric | Definition | Range and values | Caveats |
| --- | --- | --- | --- |
| `todayTaskCounts` | Open tasks in Today's Planned, Due and Decide sections. | Today. Each section returns a count from zero up. | A plan for today takes precedence. Decide includes earlier date-only deadlines and timed deadlines that have passed. The Due count covers the remaining tasks due today. No data when there are no open tasks. |
| `goalsWithoutNextAction` | Active goals without an open task that has a planned date or deadline. | Current state, with both date bounds open. Zero to the number of active goals. | Tasks can be linked directly or through a milestone. Past task dates qualify. No data when there are no active goals. `listGoalsWithoutNextAction` supplies the matching IDs and titles, oldest first. |
| `deadlinesNextSevenDays` | Open tasks with a deadline in the Plan view's next-seven-days window. | Tomorrow through today plus seven days. Count from zero up. | Timed deadlines use their local dates. Today's deadlines are handled by Today. No data when no open task has a deadline anywhere. |
| `nextCommitment` | First event or time block that has yet to end, including one in progress. | Today through today plus 29 days. One schedule entry or null. | Includes expanded recurring occurrences. Done and skipped blocks and blocks for closed tasks are excluded. No data when there are no calendar events or time blocks. |
| `habitsSummary` | Each active habit's Track consistency and its progress against this week's target. | Four user weeks including this week. One entry per active habit, oldest first. Consistency and progress report nonnegative credit and targets, with skipped and applicable at-target counts. | Uses the cadence engine and each week's schedule. Skips reduce expectations. This week's consistency accounts for elapsed days and counts today once logged. For a flexible weekly cadence, the current week can improve the consistency figure without reducing it. No data when there are no active habits. |

## Weekly review

`weeklySummary` bundles the metrics below. The review starts on the supplied local date and spans seven days. Each metric carries its own range and data flag.

| Metric | Definition | Range and values | Caveats |
| --- | --- | --- | --- |
| `tasksCompletedMetric` | Currently completed tasks whose completion instant falls in the review period. | Reviewed week. Count from zero up. | Reopening, cancelling or deleting a task can remove it from the count. No data when the user has no tasks. |
| `plannedVersusCompletedMetric` | Distinct tasks with a recorded plan date in the week, and how many of those tasks were completed during that week. | Reviewed week. Completed is between zero and planned. Planned is a count from zero up. | Used for Insights as well as Weekly Review. `task.created` and `task.planned` capture plans that later moved or cleared. The plan date determines the week, regardless of when it was assigned. Completion uses the current completed state and timestamp. Hard deletion removes task history. No data when the user has no tasks. |
| `rescheduledMetric` | Distinct tasks whose existing plan date or deadline was moved later during the week. | Reviewed week. Count from zero up. | The event time determines the week. A date set for the first time, cleared or moved earlier adds nothing. Repeated delays on one task count once. Timed deadlines use their recorded instants and date-only deadlines compare at the start of the following local day. No data when the user has no tasks. |
| `goalsWithoutActivityMetric` | Currently active goals created before the review period ended, with no recorded goal, milestone or linked task audit event and no completed linked habit log in the week. | Reviewed week. Zero to the number of eligible active goals. | Uses current links. Habit logs use their logged local date. This review metric uses any goal, milestone or task audit event, independently of the Insights meaningful-action list. No data when there are no eligible active goals. |
| `habitsPeriodMetric` | Track's progress figure for this week or consistency figure for a past week, for each currently active or paused habit that began before the period ended. | Reviewed week. One formatted figure per eligible habit, or null for a misaligned period. | The period must start on the user's configured week-start day. Uses historical schedules, pauses and logs. Skips are excluded from expectations. No data when the period is misaligned or the user has no active or paused habits. |
| `deadlinesNextPeriodMetric` | Open tasks with a deadline in the week after the review. | Seven days starting the day after the reviewed week. Count from zero up. | Timed deadlines use their local dates. No data when no open task has a deadline anywhere. |

## Insights

Planned versus completed uses `plannedVersusCompletedMetric` above. Trend points are ordered oldest first. Both trends cover the last four fully completed weeks according to the user's week-start setting.

| Metric | Definition | Range and values | Caveats |
| --- | --- | --- | --- |
| `goalInactivityMetric` | Calendar days since the latest meaningful action for each currently active goal. An action today gives zero. | All recorded history through today. One ID, last-action date and nonnegative day count per active goal. | Uses the audit event's occurrence date and current links. Actions before the goal existed and events after the calculation time are excluded. If no qualifying event survives, the goal's creation date is used. Moving or deleting linked work can change the result. No data when there are no eligible active goals. |
| `overdueTrendMetric` | Number of open tasks with a passed deadline at the close of each week. | Last four completed weeks. Four counts from zero up. | Uses task state immediately before the next week starts. A date-only deadline on the closing day counts. A timed deadline exactly at the next week's start does not. One task can count in several weeks. The audit log reconstructs prior status and deadlines of surviving tasks. Hard-deleted tasks and unrecorded changes cannot be recovered. No data when no surviving task had a deadline at any of the four snapshots. |
| `habitConsistencyTrendMetric` | Per-week completed credit, expected amount and skips for each currently active or paused habit that started by the end of the range. | Last four completed weeks. Four figures per habit. Completed credit can be fractional and runs from zero to expected. Quantity habits also report at-target days. | The cadence engine applies each week's schedule, active dates, pauses and recorded logs. Skips are excluded from expectations. A week with zero expected has no denominator for a rate. Log corrections can change historical figures. No data when none of the returned weeks has expectations or recorded skips. |
| `nextWeekWorkloadMetric` | Total estimate for open tasks planned or due next week, plus counts of tasks with and without estimates. | The next user calendar week. Minutes and task counts are nonnegative. | Each task counts once even when both dates fall in the week. Timed deadlines use their local dates. Unestimated tasks contribute no minutes. Calendar events and time blocks are outside this task estimate. No data when there are no qualifying tasks. |

### Meaningful action for goal inactivity

Only these audit event types qualify:

- On the goal: `goal.created`, `goal.updated`, `goal.status_changed`.
- On a milestone currently under the goal: `milestone.created`, `milestone.updated`, `milestone.status_changed`.
- On a task currently linked directly to the goal or through one of its milestones: `task.created`, `task.completed`, `task.reopened`.
- On a habit currently linked to the goal: `habit.logged`, `habit.log_changed`, when the status transitions to `completed` from a different status or from no log.
