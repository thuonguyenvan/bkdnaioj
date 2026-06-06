-- +goose Up
ALTER TABLE job_execution_logs
    ADD COLUMN peak_ram_bytes BIGINT,
    ADD COLUMN peak_vram_bytes BIGINT,
    ADD COLUMN execution_path TEXT,
    ADD COLUMN profile_payload JSONB;

CREATE INDEX job_execution_logs_resource_profile_idx
    ON job_execution_logs (phase_key, is_final, created_at DESC)
    WHERE peak_ram_bytes IS NOT NULL OR peak_vram_bytes IS NOT NULL;

-- +goose Down
DROP INDEX IF EXISTS job_execution_logs_resource_profile_idx;
ALTER TABLE job_execution_logs
    DROP COLUMN IF EXISTS profile_payload,
    DROP COLUMN IF EXISTS execution_path,
    DROP COLUMN IF EXISTS peak_vram_bytes,
    DROP COLUMN IF EXISTS peak_ram_bytes;
