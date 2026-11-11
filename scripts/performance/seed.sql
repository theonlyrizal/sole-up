-- Fixed identities and distributions make reruns comparable. No real accounts,
-- OAuth credentials, sessions, subscriptions or deliverable reminders are made.
CREATE FUNCTION pg_temp.seed_id(kind text, u int, n int) RETURNS uuid
LANGUAGE SQL IMMUTABLE AS $$
  SELECT overlay(overlay(md5('soleup-performance-v1:' || kind || ':' || u || ':' || n)
    placing '4' from 13) placing '8' from 17)::uuid
$$;

CREATE TEMP TABLE seed_users AS
SELECT n AS u, pg_temp.seed_id('user', n, 0) AS id
FROM seed_config, generate_series(1, users) AS n;

-- Refuse a collision with an account outside this script's reserved namespace.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM users u JOIN seed_users s ON s.id = u.id
    WHERE u.email <> 'performance-' || s.u || '@example.invalid') THEN
    RAISE EXCEPTION 'Synthetic account identity collision';
  END IF;
END $$;
DELETE FROM users u USING generate_series(1, 100) n
WHERE u.id = pg_temp.seed_id('user', n, 0)
  AND u.email = 'performance-' || n || '@example.invalid';

CREATE TEMP TABLE seed_days AS
SELECT n AS d, as_of - 364 + n AS day FROM seed_config, generate_series(0, 364) n;

INSERT INTO users (id, name, email, email_verified, created_at, updated_at)
SELECT id, 'Performance fixture ' || u, 'performance-' || u || '@example.invalid',
  true, as_of - interval '364 days', as_of
FROM seed_users CROSS JOIN seed_config;
INSERT INTO user_preferences (user_id, timezone, locale, week_start, reminders_enabled, life_area_starters)
SELECT id, 'Asia/Dhaka', 'en-GB', 1, false, 'dismissed' FROM seed_users;

INSERT INTO life_areas (id, user_id, name, sort_order)
SELECT pg_temp.seed_id('area', u, n), id,
  (ARRAY['Work', 'Health', 'Learning', 'Home', 'Relationships', 'Personal'])[n], n - 1
FROM seed_users CROSS JOIN generate_series(1, 6) n;

INSERT INTO goals (id, user_id, life_area_id, title, reason, status, priority,
  start_date, target_date, completed_at, created_at, updated_at, status_changed_at)
SELECT pg_temp.seed_id('goal', u, n), id, pg_temp.seed_id('area', u, 1 + (n - 1) % 6),
  (ARRAY['Ship client release', 'Build running endurance', 'Study language',
    'Organize household', 'Plan family visits', 'Read research'])[1 + (n - 1) % 6] || ' ' || n,
  'Make steady progress with a manageable weekly plan.',
  CASE WHEN n > 12 THEN 'active' WHEN n = 12 THEN 'paused'
    WHEN n = 11 THEN 'dropped' WHEN n = 10 THEN 'archived' ELSE 'completed' END,
  (ARRAY['low', 'medium', 'high'])[1 + n % 3],
  as_of - 364 + ((n - 1) / 3) * 55, as_of - 304 + ((n - 1) / 3) * 55,
  CASE WHEN n <= 9 THEN (as_of - 304 + ((n - 1) / 3) * 55)::timestamptz END,
  (as_of - 364 + ((n - 1) / 3) * 55)::timestamptz, as_of, as_of - interval '7 days'
FROM seed_users CROSS JOIN seed_config CROSS JOIN generate_series(1, 18) n;

INSERT INTO audit_events (user_id, entity_type, entity_id, event_type, occurred_at, changes)
SELECT g.user_id, 'goal', g.id, 'goal.created', g.created_at, jsonb_build_object(
  'status', jsonb_build_object('from', NULL, 'to', 'active'),
  'lifeAreaId', jsonb_build_object('from', NULL, 'to', life_area_id),
  'priority', jsonb_build_object('from', NULL, 'to', priority),
  'startDate', jsonb_build_object('from', NULL, 'to', start_date),
  'targetDate', jsonb_build_object('from', NULL, 'to', target_date))
FROM goals g JOIN seed_users s ON s.id = g.user_id;
INSERT INTO audit_events (user_id, entity_type, entity_id, event_type, occurred_at, changes)
SELECT g.user_id, 'goal', g.id, 'goal.status_changed', g.status_changed_at,
  jsonb_build_object('status', jsonb_build_object('from', 'active', 'to', status))
FROM goals g JOIN seed_users s ON s.id = g.user_id WHERE status <> 'active';

INSERT INTO milestones (id, user_id, goal_id, title, sort_order, status, completed_at, created_at)
SELECT pg_temp.seed_id('milestone', s.u, n), s.id,
  pg_temp.seed_id('goal', s.u, 1 + (n - 1) / 3),
  (ARRAY['Prepare', 'Practice', 'Finish'])[1 + (n - 1) % 3], (n - 1) % 3,
  CASE WHEN n <= 27 THEN 'completed' ELSE 'open' END,
  CASE WHEN n <= 27 THEN (as_of - 304 + (((n - 1) / 3) / 3) * 55 - (2 - (n - 1) % 3) * 2)::timestamptz END,
  (as_of - 364 + (((n - 1) / 3) / 3) * 55)::timestamptz
FROM seed_users s CROSS JOIN seed_config CROSS JOIN generate_series(1, 54) n;

CREATE TEMP TABLE seed_tasks AS
SELECT s.u, s.id AS user_id, d, day, d * 8 + slot AS n, slot,
  CASE WHEN d > 343 OR (d > 300 AND (d * 8 + slot) % 53 = 0) THEN 'open'
    WHEN (d * 8 + slot) % 13 = 0 THEN 'cancelled' ELSE 'completed' END AS status,
  CASE WHEN slot = 8 THEN NULL
    WHEN d > 355 THEN as_of + (slot - 4) * 3 ELSE day END AS planned_date,
  least(18, 1 + (d / 61) * 3 + slot % 3) AS goal_n
FROM seed_users s CROSS JOIN seed_days CROSS JOIN seed_config CROSS JOIN generate_series(1, 8) slot;

INSERT INTO tasks (id, user_id, goal_id, milestone_id, title, notes, status, priority,
  due_date, due_at, due_tz, planned_date, estimated_minutes, completed_at, cancelled_at,
  sort_order, created_at, updated_at)
SELECT pg_temp.seed_id('task', u, n), user_id,
  CASE WHEN slot % 3 = 0 THEN pg_temp.seed_id('goal', u, goal_n) END,
  CASE WHEN slot % 3 = 1 THEN pg_temp.seed_id('milestone', u, (goal_n - 1) * 3 + 1 + n % 3) END,
  (ARRAY['Review project proposal', 'Prepare meeting notes', 'Practice vocabulary',
    'Book appointment', 'Run training session', 'Read research chapter',
    'Plan grocery shopping', 'Call a friend'])[slot] || ' ' || day,
  CASE WHEN n % 4 = 0 THEN 'Allow time to prepare and check the result.' END,
  status, (ARRAY['low', 'medium', 'high', NULL])[1 + n % 4],
  CASE WHEN slot % 3 = 0 THEN coalesce(planned_date, day) + 2 END,
  CASE WHEN slot % 3 = 1 THEN (coalesce(planned_date, day) + 1)::timestamptz + interval '9 hours' END,
  CASE WHEN slot % 3 = 1 THEN 'Asia/Dhaka' END,
  planned_date, CASE WHEN n % 5 <> 0 THEN (ARRAY[15, 30, 45, 60, 90])[1 + n % 5] END,
  CASE WHEN status = 'completed' THEN day::timestamptz + interval '12 hours' END,
  CASE WHEN status = 'cancelled' THEN day::timestamptz + interval '13 hours' END,
  slot - 1, day::timestamptz + interval '2 hours', day::timestamptz + interval '13 hours'
FROM seed_tasks;

INSERT INTO audit_events (user_id, entity_type, entity_id, event_type, occurred_at, changes)
SELECT t.user_id, 'task', t.id, 'task.created', t.created_at, jsonb_build_object(
    'status', jsonb_build_object('from', NULL, 'to', 'open'),
    'goalId', jsonb_build_object('from', NULL, 'to', t.goal_id),
    'milestoneId', jsonb_build_object('from', NULL, 'to', t.milestone_id),
    'priority', jsonb_build_object('from', NULL, 'to', t.priority),
    'estimatedMinutes', jsonb_build_object('from', NULL, 'to', t.estimated_minutes),
    'plannedDate', jsonb_build_object('from', NULL, 'to', CASE WHEN st.n % 4 = 0 AND t.planned_date IS NOT NULL THEN st.day - 1 ELSE t.planned_date END),
    'dueDate', jsonb_build_object('from', NULL, 'to', CASE WHEN st.d % 10 = 0 THEN t.due_date - 2 ELSE t.due_date END),
    'dueAt', jsonb_build_object('from', NULL, 'to', CASE WHEN t.due_at IS NOT NULL
      THEN to_char(t.due_at - CASE WHEN st.d % 10 = 0 THEN interval '2 days' ELSE interval '0 days' END, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END),
    'dueTz', jsonb_build_object('from', NULL, 'to', t.due_tz))
FROM tasks t JOIN seed_tasks st ON t.id = pg_temp.seed_id('task', st.u, st.n);
INSERT INTO audit_events (user_id, entity_type, entity_id, event_type, occurred_at, changes)
SELECT user_id, 'task', pg_temp.seed_id('task', u, n), 'task.planned',
  day::timestamptz + interval '4 hours', jsonb_build_object(
    'plannedDate', jsonb_build_object('from', day - 1, 'to', planned_date))
FROM seed_tasks WHERE n % 4 = 0 AND planned_date IS NOT NULL;
INSERT INTO audit_events (user_id, entity_type, entity_id, event_type, occurred_at, changes)
SELECT t.user_id, 'task', t.id, 'task.due_changed', t.created_at + interval '3 hours',
  jsonb_build_object(
    'dueDate', jsonb_build_object('from', t.due_date - 2, 'to', t.due_date),
    'dueAt', jsonb_build_object(
      'from', CASE WHEN t.due_at IS NOT NULL THEN to_char(t.due_at - interval '2 days', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END,
      'to', CASE WHEN t.due_at IS NOT NULL THEN to_char(t.due_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') END),
    'dueTz', jsonb_build_object('from', t.due_tz, 'to', t.due_tz))
FROM tasks t JOIN seed_tasks st ON t.id = pg_temp.seed_id('task', st.u, st.n)
WHERE st.d % 10 = 0 AND (t.due_date IS NOT NULL OR t.due_at IS NOT NULL);
INSERT INTO audit_events (user_id, entity_type, entity_id, event_type, occurred_at, changes)
SELECT user_id, 'task', pg_temp.seed_id('task', u, n), 'task.' || status,
  day::timestamptz + interval '12 hours', jsonb_build_object(
    'status', jsonb_build_object('from', 'open', 'to', status))
FROM seed_tasks WHERE status <> 'open';

INSERT INTO calendar_events (id, user_id, goal_id, title, all_day, start_at, end_at, tz,
  start_date, end_date, rrule, created_at)
SELECT pg_temp.seed_id('event', u, d * 2 + slot), id,
  pg_temp.seed_id('goal', u, 13 + d % 6),
  CASE WHEN slot = 1 THEN 'Project check-in' ELSE 'Personal appointment' END,
  d % 14 = 0 AND slot = 2,
  CASE WHEN NOT (d % 14 = 0 AND slot = 2) THEN day::timestamptz + slot * interval '4 hours' END,
  CASE WHEN NOT (d % 14 = 0 AND slot = 2) THEN day::timestamptz + slot * interval '4 hours' + interval '45 minutes' END,
  CASE WHEN NOT (d % 14 = 0 AND slot = 2) THEN 'Asia/Dhaka' END,
  CASE WHEN d % 14 = 0 AND slot = 2 THEN day END,
  CASE WHEN d % 14 = 0 AND slot = 2 THEN day + 1 END,
  CASE WHEN d % 91 = 0 AND slot = 1 THEN 'FREQ=WEEKLY;BYDAY=' ||
    (ARRAY['MO','TU','WE','TH','FR','SA','SU'])[extract(isodow FROM day)::int] || ';COUNT=20' END,
  day::timestamptz
FROM seed_users CROSS JOIN seed_days CROSS JOIN generate_series(1, 2) slot;
INSERT INTO calendar_event_exceptions (user_id, event_id, original_start_at, kind)
SELECT e.user_id, e.id, start_at + interval '7 days', 'cancelled'
FROM calendar_events e JOIN seed_users s ON s.id = e.user_id WHERE rrule IS NOT NULL;

INSERT INTO time_blocks (id, user_id, task_id, start_at, end_at, tz, status, rrule, created_at)
SELECT pg_temp.seed_id('block', u, n), user_id, pg_temp.seed_id('task', u, n),
  day::timestamptz + (slot + 2) * interval '1 hour',
  day::timestamptz + (slot + 2) * interval '1 hour' + interval '45 minutes', 'Asia/Dhaka',
  CASE WHEN n % 182 = 1 THEN 'scheduled' WHEN status = 'completed' THEN 'done'
    WHEN status = 'cancelled' THEN 'skipped' ELSE 'scheduled' END,
  CASE WHEN n % 182 = 1 THEN 'FREQ=WEEKLY;BYDAY=' ||
    (ARRAY['MO','TU','WE','TH','FR','SA','SU'])[extract(isodow FROM day)::int] || ';COUNT=12' END, day::timestamptz
FROM seed_tasks WHERE slot <= 4;
INSERT INTO time_block_exceptions (user_id, block_id, original_start_at, kind)
SELECT b.user_id, b.id, start_at + interval '7 days', 'cancelled'
FROM time_blocks b JOIN seed_users s ON s.id = b.user_id WHERE rrule IS NOT NULL;

INSERT INTO habits (id, user_id, goal_id, title, measure, unit, start_date, status, created_at)
SELECT pg_temp.seed_id('habit', u, n), id, pg_temp.seed_id('goal', u, 13 + (n - 1) % 6),
  (ARRAY['Read', 'Walk', 'Practice language', 'Stretch', 'Write', 'Drink water',
    'Exercise', 'Reflect', 'Review notes'])[n],
  CASE WHEN n % 3 = 0 THEN 'quantity' ELSE 'check' END,
  CASE WHEN n % 3 = 0 THEN 'minutes' END,
  as_of - 364, CASE WHEN n = 8 THEN 'paused' WHEN n = 9 THEN 'archived' ELSE 'active' END,
  as_of - interval '364 days'
FROM seed_users CROSS JOIN seed_config CROSS JOIN generate_series(1, 9) n;
INSERT INTO habit_schedules (user_id, habit_id, effective_from, cadence_type, cadence_config, target)
SELECT id, pg_temp.seed_id('habit', u, n), as_of - 364 + version * 182,
  (ARRAY['daily', 'weekly_days', 'times_per_week'])[1 + n % 3],
  (ARRAY['{}', '{"days":[1,3,5]}', '{"timesPerWeek":3}'])[1 + n % 3]::jsonb,
  CASE WHEN n % 3 = 0 THEN 20 + version * 10 END
FROM seed_users CROSS JOIN seed_config CROSS JOIN generate_series(1, 9) n CROSS JOIN generate_series(0, 1) version;
INSERT INTO habit_pauses (user_id, habit_id, start_date, end_date)
SELECT id, pg_temp.seed_id('habit', u, 8), as_of - 140, as_of - 126
FROM seed_users CROSS JOIN seed_config;
INSERT INTO habit_pauses (user_id, habit_id, start_date)
SELECT id, pg_temp.seed_id('habit', u, n),
  as_of - CASE WHEN n = 8 THEN 7 ELSE 30 END
FROM seed_users CROSS JOIN seed_config CROSS JOIN generate_series(8, 9) n;
INSERT INTO habit_logs (user_id, habit_id, local_date, status, value, created_at, updated_at)
SELECT id, pg_temp.seed_id('habit', u, n), day,
  CASE WHEN (d + n) % 17 = 0 THEN 'skipped' ELSE 'completed' END,
  CASE WHEN n % 3 = 0 AND (d + n) % 17 <> 0
    THEN (CASE WHEN d < 182 THEN 20 ELSE 30 END) * (CASE WHEN d % 5 = 0 THEN 0.5 ELSE 1 END) END,
  day::timestamptz + interval '13 hours', day::timestamptz + interval '13 hours'
FROM seed_users CROSS JOIN seed_days CROSS JOIN seed_config CROSS JOIN generate_series(1, 9) n
WHERE (d + n + u) % 7 <> 0
  AND (n % 3 <> 1 OR extract(isodow FROM day) IN (1,3,5))
  AND (n % 3 <> 2 OR extract(isodow FROM day) IN (2,4,6))
  AND NOT (n = 8 AND day >= as_of - 140 AND day < as_of - 126)
  AND NOT (n = 8 AND day >= as_of - 7)
  AND NOT (n = 9 AND day >= as_of - 30);
INSERT INTO audit_events (user_id, entity_type, entity_id, event_type, occurred_at, changes)
SELECT user_id, 'habit', habit_id, 'habit.logged', created_at, jsonb_build_object(
  'localDate', local_date, 'fields', jsonb_build_array('status'),
  'status', jsonb_build_object('from', NULL, 'to', status))
FROM habit_logs l JOIN seed_users s ON s.id = l.user_id;

INSERT INTO notes (id, user_id, title, body, body_text, archived_at, created_at, updated_at)
SELECT pg_temp.seed_id('note', u, d), id, 'Project research and reflections ' || day,
  jsonb_build_object('type', 'doc', 'content', jsonb_build_array(jsonb_build_object(
    'type', 'paragraph', 'content', jsonb_build_array(jsonb_build_object(
      'type', 'text', 'text', 'Review project progress. ' || repeat('Record observations and next steps. ', 20 + d % 40)))))),
  'Review project progress. ' || repeat('Record observations and next steps. ', 20 + d % 40),
  CASE WHEN d % 19 = 0 THEN day::timestamptz + interval '1 day' END,
  day::timestamptz, day::timestamptz + interval '12 hours'
FROM seed_users CROSS JOIN seed_days WHERE d % 2 = 0;
INSERT INTO tags (id, user_id, name)
SELECT pg_temp.seed_id('tag', u, n), id, (ARRAY['Project', 'Ideas', 'Personal'])[n]
FROM seed_users CROSS JOIN generate_series(1, 3) n;
INSERT INTO note_tags (user_id, note_id, tag_id)
SELECT id, pg_temp.seed_id('note', u, d), pg_temp.seed_id('tag', u, 1 + d % 3)
FROM seed_users CROSS JOIN seed_days WHERE d % 2 = 0;
INSERT INTO note_goals (user_id, note_id, goal_id)
SELECT id, pg_temp.seed_id('note', u, d), pg_temp.seed_id('goal', u, 13 + d % 6)
FROM seed_users CROSS JOIN seed_days WHERE d % 4 = 0;
INSERT INTO note_tasks (user_id, note_id, task_id)
SELECT id, pg_temp.seed_id('note', u, d), pg_temp.seed_id('task', u, d * 8 + 1)
FROM seed_users CROSS JOIN seed_days WHERE d % 6 = 0;

INSERT INTO weekly_reviews (id, user_id, period_start, period_end, wins, completed_at, created_at, updated_at)
SELECT pg_temp.seed_id('review', u, d), id, day, day + 7,
  'Made progress on the weekly priorities.', day::timestamptz + interval '6 days 12 hours',
  day::timestamptz + interval '6 days', day::timestamptz + interval '6 days 12 hours'
FROM seed_users CROSS JOIN seed_days WHERE extract(isodow FROM day) = 1 AND d < 357;
INSERT INTO weekly_review_priorities (user_id, review_id, goal_id, sort_order)
SELECT r.user_id, r.id, g.id, 0 FROM weekly_reviews r JOIN seed_users s ON s.id = r.user_id
CROSS JOIN LATERAL (SELECT id FROM goals WHERE user_id = r.user_id AND status = 'active' ORDER BY id LIMIT 1) g;
