-- +goose Up
CREATE TABLE job_execution_logs (
    id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id             uuid        NOT NULL,
    worker_id                 uuid        NOT NULL,
    phase_key                 text        NOT NULL,
    is_final                  boolean     NOT NULL,
    predicted_runtime_seconds float4,
    actual_runtime_seconds    float4,
    error_ratio               float4      GENERATED ALWAYS AS (
                                              actual_runtime_seconds / NULLIF(predicted_runtime_seconds, 0)
                                          ) STORED,
    created_at                timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX job_execution_logs_phase_key_idx ON job_execution_logs (phase_key, is_final, created_at DESC);
CREATE INDEX job_execution_logs_worker_idx    ON job_execution_logs (worker_id, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS job_execution_logs;
