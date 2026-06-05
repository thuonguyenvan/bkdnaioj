-- +goose Up

-- Add username to users (unique, optional for existing accounts)
ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(60) UNIQUE;

-- Password reset tokens
CREATE TABLE password_reset_tokens (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token      VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_prt_token   ON password_reset_tokens(token) WHERE used_at IS NULL;
CREATE INDEX idx_prt_user    ON password_reset_tokens(user_id);

-- +goose Down
DROP TABLE IF EXISTS password_reset_tokens;
ALTER TABLE users DROP COLUMN IF EXISTS username;
