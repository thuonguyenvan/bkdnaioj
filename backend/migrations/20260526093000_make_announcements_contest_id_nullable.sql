-- +goose Up
-- Migration to make contest_id nullable for system-wide announcements
ALTER TABLE announcements ALTER COLUMN contest_id DROP NOT NULL;

-- +goose Down
-- Re-apply NOT NULL constraint
ALTER TABLE announcements ALTER COLUMN contest_id SET NOT NULL;
