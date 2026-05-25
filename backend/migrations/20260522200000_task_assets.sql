-- +goose Up
-- Task-level assets are shared by all public/private and normal/final phases of a task.
-- V1 uses this for the common judge entrypoint.

CREATE TABLE task_assets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id             UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  asset_key           VARCHAR(255) NOT NULL,
  original_filename   VARCHAR(500) NOT NULL,
  storage_path        VARCHAR(1000) NOT NULL,
  file_size           BIGINT NOT NULL DEFAULT 0,
  content_type        VARCHAR(255),
  hash_sha256         VARCHAR(128),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, asset_key),
  CONSTRAINT chk_task_asset_size CHECK (file_size >= 0)
);
CREATE INDEX idx_task_assets_task ON task_assets(task_id);

-- Backfill any existing judge assets that were uploaded per evaluation set.
INSERT INTO task_assets (
  task_id, asset_key, original_filename, storage_path, file_size, content_type, hash_sha256
)
SELECT DISTINCT ON (tes.task_id, esa.asset_key)
  tes.task_id, esa.asset_key, esa.original_filename, esa.storage_path,
  esa.file_size, esa.content_type, esa.hash_sha256
FROM evaluation_set_assets esa
JOIN task_evaluation_sets tes ON tes.id = esa.evaluation_set_id
WHERE esa.asset_key IN ('judge.py', 'judge_script')
ORDER BY tes.task_id, esa.asset_key, esa.updated_at DESC;

DELETE FROM evaluation_set_assets
WHERE asset_key IN ('judge.py', 'judge_script');

-- +goose Down
INSERT INTO evaluation_set_assets (
  evaluation_set_id, asset_key, original_filename, storage_path, file_size, content_type, hash_sha256
)
SELECT tes.id, ta.asset_key, ta.original_filename, ta.storage_path, ta.file_size, ta.content_type, ta.hash_sha256
FROM task_assets ta
JOIN task_evaluation_sets tes ON tes.task_id = ta.task_id
ON CONFLICT (evaluation_set_id, asset_key) DO NOTHING;

DROP TABLE task_assets;
