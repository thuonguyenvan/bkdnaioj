-- +goose Up
ALTER TABLE contests ADD COLUMN scale_scores BOOLEAN NOT NULL DEFAULT FALSE;

-- +goose Down
ALTER TABLE contests DROP COLUMN scale_scores;
