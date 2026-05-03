-- +goose Up
-- Migration 005: dual leaderboards + announcements + clarifications + tickets
-- Per spec §5.13–5.17.

CREATE TYPE clarification_status AS ENUM ('pending','answered','closed');
CREATE TYPE ticket_category      AS ENUM ('upload','judge','score','system');
CREATE TYPE ticket_status        AS ENUM ('open','in_progress','resolved','rejected');
CREATE TYPE ticket_priority      AS ENUM ('low','normal','high','urgent');

-- Task-phase scoped board (one row per (phase, contest_entry))
CREATE TABLE task_phase_leaderboard_entries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id           UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  task_id              UUID NOT NULL,
  phase_id             UUID NOT NULL,
  contest_entry_id     UUID NOT NULL,
  rank                 INTEGER,
  score                NUMERIC(20,5) NOT NULL,
  score_breakdown      JSONB,
  chosen_submission_id UUID REFERENCES submissions(id) ON DELETE SET NULL,
  entries_count        INTEGER NOT NULL DEFAULT 0,
  is_frozen            BOOLEAN NOT NULL DEFAULT FALSE,
  is_disqualified      BOOLEAN NOT NULL DEFAULT FALSE,
  dq_reason            TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Cross-table integrity
  CONSTRAINT fk_tplb_task_contest  FOREIGN KEY (task_id, contest_id)
    REFERENCES tasks(id, contest_id),
  CONSTRAINT fk_tplb_phase_task    FOREIGN KEY (phase_id, task_id)
    REFERENCES phases(id, task_id),
  CONSTRAINT fk_tplb_entry_contest FOREIGN KEY (contest_entry_id, contest_id)
    REFERENCES contest_entries(id, contest_id),

  UNIQUE (phase_id, contest_entry_id)
);
CREATE INDEX idx_tplb_phase_rank ON task_phase_leaderboard_entries(phase_id, rank);

-- Contest-phase scoped board (one row per (contest_phase_def, contest_entry))
CREATE TABLE contest_phase_leaderboard_entries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id           UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  contest_phase_def_id UUID NOT NULL,
  contest_entry_id     UUID NOT NULL,
  rank                 INTEGER,
  score                NUMERIC(20,5) NOT NULL,
  score_breakdown      JSONB,
  entries_count        INTEGER NOT NULL DEFAULT 0,
  is_frozen            BOOLEAN NOT NULL DEFAULT FALSE,
  is_disqualified      BOOLEAN NOT NULL DEFAULT FALSE,
  dq_reason            TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT fk_cplb_def_contest   FOREIGN KEY (contest_phase_def_id, contest_id)
    REFERENCES contest_phase_defs(id, contest_id),
  CONSTRAINT fk_cplb_entry_contest FOREIGN KEY (contest_entry_id, contest_id)
    REFERENCES contest_entries(id, contest_id),

  UNIQUE (contest_phase_def_id, contest_entry_id)
);
CREATE INDEX idx_cplb_def_rank ON contest_phase_leaderboard_entries(contest_phase_def_id, rank);

-- Communications
CREATE TABLE announcements (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id  UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  task_id     UUID REFERENCES tasks(id) ON DELETE SET NULL,
  title       VARCHAR(500) NOT NULL,
  content     TEXT NOT NULL,
  is_pinned   BOOLEAN NOT NULL DEFAULT FALSE,
  is_public   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_announcements_contest ON announcements(contest_id, is_pinned, created_at DESC);

CREATE TABLE clarifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id       UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  task_id          UUID REFERENCES tasks(id) ON DELETE SET NULL,
  phase_id         UUID REFERENCES phases(id) ON DELETE SET NULL,
  contest_entry_id UUID NOT NULL REFERENCES contest_entries(id) ON DELETE CASCADE,
  question         TEXT NOT NULL,
  answer           TEXT,
  is_public        BOOLEAN NOT NULL DEFAULT FALSE,
  status           clarification_status NOT NULL DEFAULT 'pending',
  asked_by         UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  answered_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  answered_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_clarifications_contest_status ON clarifications(contest_id, status);

CREATE TABLE tickets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id    UUID REFERENCES submissions(id) ON DELETE SET NULL,
  contest_entry_id UUID NOT NULL REFERENCES contest_entries(id) ON DELETE CASCADE,
  category         ticket_category NOT NULL,
  subject          VARCHAR(500) NOT NULL,
  description      TEXT NOT NULL,
  status           ticket_status NOT NULL DEFAULT 'open',
  priority         ticket_priority NOT NULL DEFAULT 'normal',
  assigned_to      UUID REFERENCES users(id) ON DELETE SET NULL,
  created_by       UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at      TIMESTAMPTZ,
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_tickets_entry_status ON tickets(contest_entry_id, status);

-- +goose Down
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS clarifications;
DROP TABLE IF EXISTS announcements;
DROP TABLE IF EXISTS contest_phase_leaderboard_entries;
DROP TABLE IF EXISTS task_phase_leaderboard_entries;
DROP TYPE  IF EXISTS ticket_priority;
DROP TYPE  IF EXISTS ticket_status;
DROP TYPE  IF EXISTS ticket_category;
DROP TYPE  IF EXISTS clarification_status;
