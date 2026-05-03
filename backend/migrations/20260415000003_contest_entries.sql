-- +goose Up
-- Migration 003: contest_entries, contest_entry_members
-- Per spec §5.8–5.9. Entry-driven core.

CREATE TYPE entry_type    AS ENUM ('individual','team');
CREATE TYPE entry_mode    AS ENUM ('official','virtual','practice');
CREATE TYPE entry_status  AS ENUM ('pending','approved','active','disqualified','finished');
CREATE TYPE entry_member_role AS ENUM ('leader','member');

CREATE TABLE contest_entries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id    UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  entry_type    entry_type NOT NULL,
  entry_mode    entry_mode NOT NULL,
  user_id       UUID REFERENCES users(id) ON DELETE RESTRICT,
  team_id       UUID REFERENCES teams(id) ON DELETE RESTRICT,
  display_name  VARCHAR(255) NOT NULL,
  status        entry_status NOT NULL DEFAULT 'pending',
  registered_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  approved_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at   TIMESTAMPTZ,
  start_at      TIMESTAMPTZ,
  end_at        TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Composite UNIQUE for cross-contest FK enforcement on submissions/leaderboards
  UNIQUE (id, contest_id),
  CONSTRAINT chk_entry_exactly_one CHECK (
    (user_id IS NOT NULL AND team_id IS NULL) OR
    (user_id IS NULL AND team_id IS NOT NULL)
  ),
  CONSTRAINT chk_entry_type_consistency CHECK (
    (entry_type = 'individual' AND user_id IS NOT NULL) OR
    (entry_type = 'team'       AND team_id IS NOT NULL)
  ),
  CONSTRAINT chk_entry_virtual_window CHECK (
    entry_mode <> 'virtual'
    OR (start_at IS NOT NULL AND end_at IS NOT NULL AND start_at < end_at)
  )
);

-- Prevent duplicates per (contest, mode, participant)
CREATE UNIQUE INDEX uq_entries_user_per_mode
  ON contest_entries(contest_id, entry_mode, user_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX uq_entries_team_per_mode
  ON contest_entries(contest_id, entry_mode, team_id)
  WHERE team_id IS NOT NULL;

CREATE INDEX idx_entries_lookup ON contest_entries(contest_id, entry_mode, status);

-- Per-contest lineup (snapshot of who actually competes)
CREATE TABLE contest_entry_members (
  contest_entry_id UUID NOT NULL REFERENCES contest_entries(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  role             entry_member_role NOT NULL DEFAULT 'member',
  joined_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (contest_entry_id, user_id)
);
CREATE INDEX idx_entry_members_lookup ON contest_entry_members(contest_entry_id, user_id);

-- +goose Down
DROP TABLE IF EXISTS contest_entry_members;
DROP TABLE IF EXISTS contest_entries;
DROP TYPE  IF EXISTS entry_member_role;
DROP TYPE  IF EXISTS entry_status;
DROP TYPE  IF EXISTS entry_mode;
DROP TYPE  IF EXISTS entry_type;
