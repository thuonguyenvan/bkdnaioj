-- +goose Up

-- Add max_workers capacity field
ALTER TABLE volunteer_workers ADD COLUMN max_workers SMALLINT NOT NULL DEFAULT 1;

-- Per-job claim tracking (replaces current_job_id + job_claimed_at)
CREATE TABLE volunteer_worker_claims (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id     UUID NOT NULL REFERENCES volunteer_workers(id) ON DELETE CASCADE,
    submission_id UUID NOT NULL,
    claimed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (submission_id)
);

CREATE INDEX idx_vwc_worker    ON volunteer_worker_claims(worker_id);
CREATE INDEX idx_vwc_claimed   ON volunteer_worker_claims(claimed_at);

-- Migrate existing single claims
INSERT INTO volunteer_worker_claims (worker_id, submission_id, claimed_at)
SELECT id, current_job_id, COALESCE(job_claimed_at, now())
FROM volunteer_workers
WHERE current_job_id IS NOT NULL;

-- Drop old single-job columns
ALTER TABLE volunteer_workers
    DROP COLUMN IF EXISTS current_job_id,
    DROP COLUMN IF EXISTS job_claimed_at;

-- +goose Down
ALTER TABLE volunteer_workers
    ADD COLUMN current_job_id  UUID,
    ADD COLUMN job_claimed_at  TIMESTAMPTZ;

DROP TABLE IF EXISTS volunteer_worker_claims;
ALTER TABLE volunteer_workers DROP COLUMN IF EXISTS max_workers;
