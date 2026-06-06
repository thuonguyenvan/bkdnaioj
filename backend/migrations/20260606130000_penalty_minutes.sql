-- +goose Up
ALTER TABLE task_phase_leaderboard_entries
    ADD COLUMN penalty_minutes NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE contest_phase_leaderboard_entries
    ADD COLUMN penalty_minutes NUMERIC NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE task_phase_leaderboard_entries    DROP COLUMN IF EXISTS penalty_minutes;
ALTER TABLE contest_phase_leaderboard_entries DROP COLUMN IF EXISTS penalty_minutes;
