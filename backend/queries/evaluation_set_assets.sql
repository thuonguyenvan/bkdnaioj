-- name: UpsertEvaluationSetAsset :one
INSERT INTO evaluation_set_assets (
  evaluation_set_id, asset_key, original_filename, storage_path, file_size, content_type, hash_sha256
) VALUES ($1, $2, $3, $4, $5, $6, $7)
ON CONFLICT (evaluation_set_id, asset_key) DO UPDATE SET
  original_filename = EXCLUDED.original_filename,
  storage_path      = EXCLUDED.storage_path,
  file_size         = EXCLUDED.file_size,
  content_type      = EXCLUDED.content_type,
  hash_sha256       = EXCLUDED.hash_sha256,
  updated_at        = now()
RETURNING *;

-- name: ListEvaluationSetAssets :many
SELECT * FROM evaluation_set_assets WHERE evaluation_set_id = $1 ORDER BY asset_key;
