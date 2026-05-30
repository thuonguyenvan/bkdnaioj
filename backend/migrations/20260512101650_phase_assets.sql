-- +goose Up
-- Phase assets stored in S3/MinIO (judge scripts, datasets, ground truth, etc.)

CREATE TABLE phase_assets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_id           UUID NOT NULL REFERENCES phases(id) ON DELETE CASCADE,
  asset_key          VARCHAR(255) NOT NULL,
  original_filename  VARCHAR(500) NOT NULL,
  storage_path       VARCHAR(1000) NOT NULL,
  file_size          BIGINT NOT NULL DEFAULT 0,
  content_type       VARCHAR(255),
  hash_sha256        VARCHAR(128),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (phase_id, asset_key),
  CONSTRAINT chk_phase_asset_size CHECK (file_size >= 0)
);

CREATE INDEX idx_phase_assets_phase ON phase_assets(phase_id);

-- +goose Down
DROP TABLE IF EXISTS phase_assets;
