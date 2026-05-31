-- +goose Up

CREATE TYPE volunteer_worker_status AS ENUM (
    'pending',
    'active',
    'rejected',
    'inactive'
);

CREATE TABLE volunteer_workers (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID REFERENCES users(id) ON DELETE SET NULL,
    display_name     VARCHAR(120)           NOT NULL,
    status           volunteer_worker_status NOT NULL DEFAULT 'pending',

    api_token        VARCHAR(64) UNIQUE,

    capabilities     JSONB NOT NULL DEFAULT '{}',

    last_seen_at     TIMESTAMPTZ,
    cpu_usage        SMALLINT,
    ram_usage        SMALLINT,

    current_job_id   UUID,
    job_claimed_at   TIMESTAMPTZ,

    jobs_completed   INTEGER NOT NULL DEFAULT 0,
    jobs_failed      INTEGER NOT NULL DEFAULT 0,

    approved_at      TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_volunteer_workers_status    ON volunteer_workers(status);
CREATE INDEX idx_volunteer_workers_token     ON volunteer_workers(api_token) WHERE api_token IS NOT NULL;
CREATE INDEX idx_volunteer_workers_job       ON volunteer_workers(current_job_id) WHERE current_job_id IS NOT NULL;

-- +goose Down
DROP TABLE IF EXISTS volunteer_workers;
DROP TYPE  IF EXISTS volunteer_worker_status;
