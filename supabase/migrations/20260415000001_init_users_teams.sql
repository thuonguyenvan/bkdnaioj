-- +goose Up
-- Migration 001: users, teams, team_members
-- Per ai-contest-database-design-specification.md §5.1–5.3

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Platform-level role
CREATE TYPE user_role AS ENUM ('contestant','jury','admin');

-- Team-level role
-- Team-level role (excludes 'owner' — ownership tracked via teams.owner_id)
CREATE TYPE team_role AS ENUM ('manager','member');

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  full_name     VARCHAR(255) NOT NULL,
  role          user_role    NOT NULL DEFAULT 'contestant',
  student_id    VARCHAR(64),
  avatar_url    VARCHAR(500),
  last_visit    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role  ON users(role);

-- Global teams (NOT bound to a contest)
CREATE TABLE teams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       VARCHAR(120) NOT NULL UNIQUE,
  name       VARCHAR(255) NOT NULL,
  owner_id   UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_teams_slug  ON teams(slug);
CREATE INDEX idx_teams_owner ON teams(owner_id);

-- M:N user ↔ team
CREATE TABLE team_members (
  team_id   UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role      team_role NOT NULL DEFAULT 'member',
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);
CREATE INDEX idx_team_members_user ON team_members(user_id);
