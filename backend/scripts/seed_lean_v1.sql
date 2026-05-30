-- Lean V1 dev seed: contest with one task, two evaluation sets, four phases, and one entry.
-- Assumes migrations already applied.

INSERT INTO users (id, email, password_hash, full_name, role)
VALUES (
  '11111111-1111-1111-1111-111111111111',
  'dev@local',
  'not-a-real-hash',
  'Dev User',
  'contestant'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO users (id, email, password_hash, full_name, role)
VALUES (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'admin@local',
  'not-a-real-hash',
  'Dev Admin',
  'admin'
) ON CONFLICT (email) DO NOTHING;

INSERT INTO contests (
  id, slug, title, status, entry_policy,
  start_time, end_time, visibility, rules_json,
  created_by, max_team_size
) VALUES (
  '22222222-2222-2222-2222-222222222222',
  'dev-contest',
  'Dev Contest',
  'running',
  'individual',
  now() - interval '1 day',
  now() + interval '30 day',
  'public',
  '{}'::jsonb,
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  1
) ON CONFLICT (slug) DO NOTHING;

INSERT INTO contest_phase_defs (id, contest_id, key, title, sort_order)
VALUES
  ('33333333-3333-3333-3333-333333333333', '22222222-2222-2222-2222-222222222222', 'public_test',   'Public Test',         1),
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'private_test',  'Private Test',        2),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '22222222-2222-2222-2222-222222222222', 'final_public',  'Final Public Test',   3),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', '22222222-2222-2222-2222-222222222222', 'final_private', 'Final Private Test',  4)
ON CONFLICT (contest_id, key) DO NOTHING;

INSERT INTO tasks (
  id, contest_id, slug, title, description,
  submission_schema, score_label, higher_is_better, sort_order
) VALUES (
  '55555555-5555-5555-5555-555555555555',
  '22222222-2222-2222-2222-222222222222',
  'task-1',
  'Task 1',
  'Dev task',
  '{"required":["predictions.csv"]}'::jsonb,
  'Score',
  true,
  1
) ON CONFLICT (contest_id, slug) DO NOTHING;

INSERT INTO task_evaluation_sets (id, task_id, key, title)
VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1', '55555555-5555-5555-5555-555555555555', 'public',  'Public Evaluation Set'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2', '55555555-5555-5555-5555-555555555555', 'private', 'Private Evaluation Set')
ON CONFLICT (task_id, key) DO UPDATE SET title = EXCLUDED.title;

INSERT INTO phases (
  id, task_id, contest_phase_def_id, evaluation_set_id, slug, title,
  description, open_time, close_time, judge_key,
  submission_limit, leaderboard_mode, allow_official_submit,
  allow_virtual_submit, allow_practice_submit, display_scores,
  is_frozen, is_final, sort_order
) VALUES
  (
    '66666666-6666-6666-6666-666666666666',
    '55555555-5555-5555-5555-555555555555',
    '33333333-3333-3333-3333-333333333333',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
    'public', 'Public Test', 'Dev public phase',
    now() - interval '1 day', now() + interval '30 day', 'demo_public',
    999, 'best', true, true, true, true, false, false, 1
  ),
  (
    '99999999-9999-9999-9999-999999999999',
    '55555555-5555-5555-5555-555555555555',
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1',
    'final-public', 'Final Public Test', 'Dev final public phase',
    now() - interval '1 day', now() + interval '30 day', 'demo_final_public',
    999, 'best', true, true, true, true, false, true, 2
  ),
  (
    'dddddddd-dddd-dddd-dddd-dddddddddddd',
    '55555555-5555-5555-5555-555555555555',
    '44444444-4444-4444-4444-444444444444',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2',
    'private', 'Private Test', 'Dev private phase',
    now() - interval '1 day', now() + interval '30 day', 'demo_private',
    999, 'best', true, true, true, true, false, false, 3
  ),
  (
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
    '55555555-5555-5555-5555-555555555555',
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee2',
    'final-private', 'Final Private Test', 'Dev final private phase',
    now() - interval '1 day', now() + interval '30 day', 'demo_final_private',
    999, 'best', true, true, true, true, false, true, 4
  )
ON CONFLICT (task_id, slug) DO UPDATE SET
  contest_phase_def_id = EXCLUDED.contest_phase_def_id,
  evaluation_set_id = EXCLUDED.evaluation_set_id,
  title = EXCLUDED.title,
  judge_key = EXCLUDED.judge_key,
  is_final = EXCLUDED.is_final,
  sort_order = EXCLUDED.sort_order;

INSERT INTO contest_entries (
  id, contest_id, entry_type, entry_mode, user_id, team_id,
  display_name, status, registered_by, start_at, end_at
) VALUES (
  '77777777-7777-7777-7777-777777777777',
  '22222222-2222-2222-2222-222222222222',
  'individual',
  'official',
  '11111111-1111-1111-1111-111111111111',
  NULL,
  'Dev Entry',
  'active',
  '11111111-1111-1111-1111-111111111111',
  NULL,
  NULL
) ON CONFLICT DO NOTHING;

INSERT INTO contest_entry_members (contest_entry_id, user_id, role)
VALUES (
  '77777777-7777-7777-7777-777777777777',
  '11111111-1111-1111-1111-111111111111',
  'leader'
) ON CONFLICT DO NOTHING;
