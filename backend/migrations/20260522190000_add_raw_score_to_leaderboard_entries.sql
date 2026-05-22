-- +goose Up
ALTER TABLE task_phase_leaderboard_entries ADD COLUMN raw_score NUMERIC(20,5) NOT NULL DEFAULT 0;
ALTER TABLE contest_phase_leaderboard_entries ADD COLUMN raw_score NUMERIC(20,5) NOT NULL DEFAULT 0;

-- +goose Down
ALTER TABLE task_phase_leaderboard_entries DROP COLUMN raw_score;
ALTER TABLE contest_phase_leaderboard_entries DROP COLUMN raw_score;
