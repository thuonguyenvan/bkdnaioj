-- +goose Up
ALTER TABLE volunteer_worker_claims
    ADD COLUMN attempt_id UUID NOT NULL DEFAULT gen_random_uuid(),
    ADD COLUMN lease_expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '2 minutes',
    ADD COLUMN last_heartbeat_at TIMESTAMPTZ;

CREATE UNIQUE INDEX idx_vwc_attempt ON volunteer_worker_claims(attempt_id);
CREATE INDEX idx_vwc_lease_expires ON volunteer_worker_claims(lease_expires_at);

-- +goose Down
DROP INDEX IF EXISTS idx_vwc_lease_expires;
DROP INDEX IF EXISTS idx_vwc_attempt;
ALTER TABLE volunteer_worker_claims
    DROP COLUMN IF EXISTS last_heartbeat_at,
    DROP COLUMN IF EXISTS lease_expires_at,
    DROP COLUMN IF EXISTS attempt_id;
