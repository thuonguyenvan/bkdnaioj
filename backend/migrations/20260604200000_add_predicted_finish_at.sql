-- +goose Up
ALTER TABLE volunteer_worker_claims
    ADD COLUMN predicted_finish_at TIMESTAMPTZ;

CREATE INDEX idx_vwc_predicted_finish ON volunteer_worker_claims(predicted_finish_at)
    WHERE predicted_finish_at IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS idx_vwc_predicted_finish;
ALTER TABLE volunteer_worker_claims DROP COLUMN IF EXISTS predicted_finish_at;
