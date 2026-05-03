-- +goose Up
-- Migration 002: contests, contest_phase_defs, tasks, phases
-- Per spec §5.4–5.7. Composite UNIQUEs enable downstream cross-contest FKs.

CREATE TYPE contest_status      AS ENUM ('draft','registration_open','running','ended','archived');
CREATE TYPE contest_visibility  AS ENUM ('public','private');
CREATE TYPE contest_entry_policy AS ENUM ('individual','team','both');
CREATE TYPE contest_phase_key   AS ENUM ('public_test','private_test','final_public','final_private');
CREATE TYPE leaderboard_mode    AS ENUM ('best','latest');

CREATE TABLE contests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                VARCHAR(120) NOT NULL UNIQUE,
  title               VARCHAR(500) NOT NULL,
  description         TEXT,
  banner_url          VARCHAR(500),
  status              contest_status NOT NULL DEFAULT 'draft',
  entry_policy        contest_entry_policy NOT NULL DEFAULT 'individual',
  registration_start  TIMESTAMPTZ,
  registration_end    TIMESTAMPTZ,
  start_time          TIMESTAMPTZ NOT NULL,
  end_time            TIMESTAMPTZ NOT NULL,
  visibility          contest_visibility NOT NULL DEFAULT 'public',
  rules_json          JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by          UUID REFERENCES users(id) ON DELETE SET NULL,
  max_team_size       INTEGER NOT NULL,
  require_approval    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_contests_reg_window  CHECK (registration_start IS NULL OR registration_end IS NULL OR registration_start <= registration_end),
  CONSTRAINT chk_contests_run_window  CHECK (start_time < end_time),
  CONSTRAINT chk_contests_team_size   CHECK (max_team_size > 0),
  CONSTRAINT chk_contests_team_size_policy CHECK (entry_policy = 'individual' OR max_team_size > 1)
);
CREATE INDEX idx_contests_lookup ON contests(slug, status, start_time, end_time);

-- Logical contest-wide phase definitions (4 per contest in V1)
CREATE TABLE contest_phase_defs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id  UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  key         contest_phase_key NOT NULL,
  title       VARCHAR(255) NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  UNIQUE (contest_id, key),
  -- Composite UNIQUE for downstream FK targets that need (id, contest_id)
  UNIQUE (id, contest_id)
);
CREATE INDEX idx_contest_phase_defs_lookup ON contest_phase_defs(contest_id, key, sort_order);

CREATE TABLE tasks (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id             UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  slug                   VARCHAR(120) NOT NULL,
  title                  VARCHAR(500) NOT NULL,
  description            TEXT,
  problem_statement_url  VARCHAR(500),
  submission_schema      JSONB NOT NULL DEFAULT '{}'::jsonb,
  score_label            VARCHAR(120) NOT NULL DEFAULT 'Score',
  higher_is_better       BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order             INTEGER NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contest_id, slug),
  -- Composite UNIQUE for cross-contest FK enforcement on submissions/leaderboards
  UNIQUE (id, contest_id)
);
CREATE INDEX idx_tasks_contest_order ON tasks(contest_id, sort_order);

CREATE TABLE phases (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id               UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  contest_phase_def_id  UUID NOT NULL REFERENCES contest_phase_defs(id) ON DELETE RESTRICT,
  slug                  VARCHAR(120) NOT NULL,
  title                 VARCHAR(255) NOT NULL,
  description           TEXT,
  open_time             TIMESTAMPTZ NOT NULL,
  close_time            TIMESTAMPTZ NOT NULL,
  judge_key             VARCHAR(255) NOT NULL,
  submission_limit      INTEGER,
  leaderboard_mode      leaderboard_mode NOT NULL DEFAULT 'best',
  allow_official_submit BOOLEAN NOT NULL DEFAULT TRUE,
  allow_virtual_submit  BOOLEAN NOT NULL DEFAULT TRUE,
  allow_practice_submit BOOLEAN NOT NULL DEFAULT TRUE,
  display_scores        BOOLEAN NOT NULL DEFAULT TRUE,
  is_frozen             BOOLEAN NOT NULL DEFAULT FALSE,
  is_final              BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order            INTEGER NOT NULL DEFAULT 0,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, slug),
  UNIQUE (task_id, contest_phase_def_id),
  -- Composite UNIQUE for FK from submissions(phase_id, task_id)
  UNIQUE (id, task_id),
  CONSTRAINT chk_phases_window CHECK (open_time < close_time),
  CONSTRAINT chk_phases_limit  CHECK (submission_limit IS NULL OR submission_limit >= 0)
);
CREATE INDEX idx_phases_task_window ON phases(task_id, open_time, close_time);
