-- +goose Up
-- Task evaluation sets let public/final-public and private/final-private share the same judge/data assets.

CREATE TYPE evaluation_set_key AS ENUM ('public', 'private');

CREATE TABLE task_evaluation_sets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  key         evaluation_set_key NOT NULL,
  title       VARCHAR(255) NOT NULL,
  description TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (task_id, key),
  UNIQUE (id, task_id)
);
CREATE INDEX idx_task_evaluation_sets_task ON task_evaluation_sets(task_id, key);

CREATE TABLE evaluation_set_assets (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  evaluation_set_id  UUID NOT NULL REFERENCES task_evaluation_sets(id) ON DELETE CASCADE,
  asset_key          VARCHAR(255) NOT NULL,
  original_filename  VARCHAR(500) NOT NULL,
  storage_path       VARCHAR(1000) NOT NULL,
  file_size          BIGINT NOT NULL DEFAULT 0,
  content_type       VARCHAR(255),
  hash_sha256        VARCHAR(128),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (evaluation_set_id, asset_key),
  CONSTRAINT chk_evaluation_set_asset_size CHECK (file_size >= 0)
);
CREATE INDEX idx_evaluation_set_assets_set ON evaluation_set_assets(evaluation_set_id);

ALTER TABLE phases ADD COLUMN evaluation_set_id UUID;

INSERT INTO task_evaluation_sets (task_id, key, title)
SELECT id, 'public'::evaluation_set_key, 'Public Evaluation Set'
FROM tasks
ON CONFLICT (task_id, key) DO NOTHING;

INSERT INTO task_evaluation_sets (task_id, key, title)
SELECT id, 'private'::evaluation_set_key, 'Private Evaluation Set'
FROM tasks
ON CONFLICT (task_id, key) DO NOTHING;

UPDATE phases p
SET evaluation_set_id = tes.id
FROM contest_phase_defs cpd, task_evaluation_sets tes
WHERE p.contest_phase_def_id = cpd.id
  AND tes.task_id = p.task_id
  AND tes.key = CASE
    WHEN cpd.key IN ('public_test', 'final_public') THEN 'public'::evaluation_set_key
    WHEN cpd.key IN ('private_test', 'final_private') THEN 'private'::evaluation_set_key
  END;

INSERT INTO evaluation_set_assets (
  evaluation_set_id, asset_key, original_filename, storage_path, file_size, content_type, hash_sha256
)
SELECT DISTINCT ON (p.evaluation_set_id, pa.asset_key)
  p.evaluation_set_id, pa.asset_key, pa.original_filename, pa.storage_path,
  pa.file_size, pa.content_type, pa.hash_sha256
FROM phase_assets pa
JOIN phases p ON p.id = pa.phase_id
WHERE p.evaluation_set_id IS NOT NULL
ORDER BY p.evaluation_set_id, pa.asset_key, pa.updated_at DESC;

ALTER TABLE phases ALTER COLUMN evaluation_set_id SET NOT NULL;
ALTER TABLE phases
  ADD CONSTRAINT fk_phases_evaluation_set_task
  FOREIGN KEY (evaluation_set_id, task_id) REFERENCES task_evaluation_sets(id, task_id);

DROP TABLE phase_assets;

-- +goose Down
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

INSERT INTO phase_assets (
  phase_id, asset_key, original_filename, storage_path, file_size, content_type, hash_sha256
)
SELECT p.id, esa.asset_key, esa.original_filename, esa.storage_path, esa.file_size, esa.content_type, esa.hash_sha256
FROM evaluation_set_assets esa
JOIN phases p ON p.evaluation_set_id = esa.evaluation_set_id;

ALTER TABLE phases DROP CONSTRAINT fk_phases_evaluation_set_task;
ALTER TABLE phases DROP COLUMN evaluation_set_id;
DROP TABLE evaluation_set_assets;
DROP TABLE task_evaluation_sets;
DROP TYPE evaluation_set_key;
