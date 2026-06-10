-- +goose Up
CREATE TABLE experiment_events (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type    TEXT NOT NULL,
    submission_id UUID,
    worker_id     UUID,
    attempt_id    UUID,
    phase_key     TEXT,
    is_final      BOOLEAN,
    strategy      TEXT,
    payload       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX experiment_events_submission_idx ON experiment_events (submission_id, created_at);
CREATE INDEX experiment_events_type_idx       ON experiment_events (event_type, created_at);
CREATE INDEX experiment_events_worker_idx     ON experiment_events (worker_id, created_at);

CREATE TABLE scheduler_decision_logs (
    id                                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    worker_id                           UUID NOT NULL,
    selected_submission_id              UUID,
    strategy                            TEXT NOT NULL,
    candidates_considered               INTEGER NOT NULL DEFAULT 0,
    compatible_candidates               INTEGER NOT NULL DEFAULT 0,
    rejected_candidates                 INTEGER NOT NULL DEFAULT 0,
    selected_predicted_runtime_seconds  REAL,
    selected_corrected_runtime_seconds  REAL,
    selected_cost                       JSONB NOT NULL DEFAULT '{}'::jsonb,
    reject_summary                      JSONB NOT NULL DEFAULT '{}'::jsonb,
    reason                              TEXT,
    created_at                          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX scheduler_decision_logs_worker_idx     ON scheduler_decision_logs (worker_id, created_at);
CREATE INDEX scheduler_decision_logs_submission_idx ON scheduler_decision_logs (selected_submission_id, created_at);

-- +goose Down
DROP TABLE IF EXISTS scheduler_decision_logs;
DROP TABLE IF EXISTS experiment_events;
