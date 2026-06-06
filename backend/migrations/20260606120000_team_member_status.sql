-- +goose Up
ALTER TABLE team_members
    ADD COLUMN status TEXT NOT NULL DEFAULT 'accepted'
        CHECK (status IN ('pending','accepted','declined'));

-- +goose Down
ALTER TABLE team_members DROP COLUMN IF EXISTS status;
