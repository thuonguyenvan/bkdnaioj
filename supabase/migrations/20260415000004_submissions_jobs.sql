-- +goose Up
-- Migration 004: submissions, submission_files, evaluation_jobs
-- Per spec §5.10–5.12. Score stored inline on submissions (V1).

CREATE TYPE submission_status AS ENUM ('uploaded','validating','queued','running','done','failed');
CREATE TYPE eval_job_type     AS ENUM ('validate','judge','rejudge');
CREATE TYPE eval_job_status   AS ENUM ('pending','running','done','failed');

CREATE TABLE submissions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id        UUID NOT NULL REFERENCES contests(id) ON DELETE CASCADE,
  contest_entry_id  UUID NOT NULL,
  task_id           UUID NOT NULL,
  phase_id          UUID NOT NULL,
  submitted_by      UUID NOT NULL,
  status            submission_status NOT NULL DEFAULT 'uploaded',
  submitted_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  file_count        INTEGER NOT NULL DEFAULT 0,
  total_size_bytes  BIGINT  NOT NULL DEFAULT 0,
  manifest_hash     VARCHAR(128),
  validation_result JSONB,
  error_message     TEXT,
  raw_score         NUMERIC(20,10),
  display_score     NUMERIC(20,5),
  score_payload     JSONB,
  evaluated_at      TIMESTAMPTZ,
  is_final          BOOLEAN NOT NULL DEFAULT FALSE,
  rejudge_count     INTEGER NOT NULL DEFAULT 0,
  client_ip         VARCHAR(64),
  user_agent        VARCHAR(500),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Cross-contest integrity (composite FKs)
  CONSTRAINT fk_sub_entry_contest FOREIGN KEY (contest_entry_id, contest_id)
    REFERENCES contest_entries(id, contest_id),
  CONSTRAINT fk_sub_task_contest  FOREIGN KEY (task_id, contest_id)
    REFERENCES tasks(id, contest_id),
  CONSTRAINT fk_sub_phase_task    FOREIGN KEY (phase_id, task_id)
    REFERENCES phases(id, task_id),
  CONSTRAINT fk_sub_member        FOREIGN KEY (contest_entry_id, submitted_by)
    REFERENCES contest_entry_members(contest_entry_id, user_id),

  CONSTRAINT chk_sub_file_count   CHECK (file_count >= 0),
  CONSTRAINT chk_sub_size         CHECK (total_size_bytes >= 0),
  CONSTRAINT chk_sub_rejudge      CHECK (rejudge_count >= 0)
);
CREATE INDEX idx_sub_lookup    ON submissions(contest_id, contest_entry_id, task_id, phase_id, submitted_at DESC);
CREATE INDEX idx_sub_status    ON submissions(status);
CREATE INDEX idx_sub_phase     ON submissions(phase_id, submitted_at DESC);

CREATE TABLE submission_files (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id     UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  original_filename VARCHAR(500) NOT NULL,
  storage_path      VARCHAR(1000) NOT NULL,
  file_size         BIGINT NOT NULL DEFAULT 0,
  content_type      VARCHAR(255),
  hash_sha256       VARCHAR(128),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_subfile_size CHECK (file_size >= 0)
);
CREATE INDEX idx_subfiles_submission ON submission_files(submission_id);

-- Asynchronous evaluation pipeline jobs
-- NOTE: no phase_id column; derived via submission (per spec §5.12)
CREATE TABLE evaluation_jobs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id     UUID NOT NULL REFERENCES submissions(id) ON DELETE CASCADE,
  job_type          eval_job_type   NOT NULL,
  status            eval_job_status NOT NULL DEFAULT 'pending',
  priority          INTEGER NOT NULL DEFAULT 5,
  worker_id         VARCHAR(120),
  attempt_count     INTEGER NOT NULL DEFAULT 0,
  max_attempts      INTEGER NOT NULL DEFAULT 3,
  input_data        JSONB,
  output_data       JSONB,
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  execution_time_ms INTEGER,
  error_log         TEXT,
  external_job_id   VARCHAR(255),  -- broker-agnostic id (Redis Streams entry id, etc.)
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_evjob_attempt  CHECK (attempt_count >= 0),
  CONSTRAINT chk_evjob_max      CHECK (max_attempts >= 0),
  CONSTRAINT chk_evjob_priority CHECK (priority >= 0)
);
CREATE INDEX idx_evjob_status     ON evaluation_jobs(status, created_at);
CREATE INDEX idx_evjob_submission ON evaluation_jobs(submission_id);
