## Context
Hiện tại worker đang chấm bằng data demo mount tại `/demo` (local volume). Bước tiếp theo là đưa artifacts thật (contestant submission + organizer assets: judge script, datasets/ground truth) lên MinIO/S3 để:
- FE upload trực tiếp bằng presigned URL (upload model/zip lớn, lâu, nhiều user upload đồng thời) mà không làm API thành bottleneck bandwidth.
- Worker stateless: tải artifacts từ storage theo metadata trong DB, chạy infer/judge, cập nhật DB và emit `jobs:results` như hiện tại.

## Recommended approach (Lean V1, production-friendly)
### 1) DB: lưu metadata cho 2 loại artifacts
**A. Contestant submission files (đã có):** table `submission_files` (migration 004).
- Thêm sqlc queries để insert/list file theo `submission_id`.

**B. Organizer phase assets (mới):** thêm table `phase_assets` (migration mới).
- Columns đề xuất:
  - `id UUID PK`
  - `phase_id UUID NOT NULL REFERENCES phases(id) ON DELETE CASCADE`
  - `asset_key VARCHAR(255) NOT NULL` (vd: `judge.py`, `datasets.zip`, `ground_truth.csv` hoặc key logic như `judge_script`, `datasets_zip`)
  - `original_filename VARCHAR(500) NOT NULL`
  - `storage_path VARCHAR(1000) NOT NULL` (S3 object key)
  - `file_size BIGINT NOT NULL`
  - `content_type VARCHAR(255)`
  - `hash_sha256 VARCHAR(128)` (optional)
  - `created_at TIMESTAMPTZ`
- Unique: `(phase_id, asset_key)`.
- sqlc queries: upsert asset, list assets by phase.

### 2) API: presigned upload flow (không relay file)
#### 2.1 Config / deps
- Extend config: thêm `S3_PUBLIC_ENDPOINT` (host trả về trong presigned URL) tách khỏi endpoint nội bộ.
  - Dev: API container dùng `S3_ENDPOINT=http://minio:9000` (nội bộ docker)
  - FE dùng presigned URL với `S3_PUBLIC_ENDPOINT=http://localhost:9000`
- Tạo package: `backend/internal/storage/s3.go`
  - AWS S3 client (aws-sdk-go-v2) với endpoint custom (MinIO) + static credentials.
  - Presign PUT URL với expires (vd 15 phút).
  - (Dev) ensure bucket exists (idempotent).
- Inject vào router deps: `Deps.Storage *storage.S3`.

#### 2.2 Endpoints cho contestant submission
**(1) Initiate**: `POST /api/v1/entries/:entry_id/submissions:initiate`
- Input: `{ task_id, phase_id, files: [{filename, content_type, size_bytes}] }`
- API:
  - Authorize: user thuộc entry.
  - Create submission row với `status='uploaded'`.
  - Object keys: `submissions/{submission_id}/{filename}`.
  - Output: `submission_id` + list `{filename, object_key, put_url}`.

**(2) Complete**: `POST /api/v1/submissions/:id/complete`
- Input: `{ files: [{filename, object_key, size_bytes, content_type, sha256?}] }`
- API:
  - Verify object_key prefix match submission_id.
  - Insert `submission_files`.
  - Update `submissions.file_count/total_size_bytes`, set `status='queued'`.
  - Enqueue `jobs:judge`.

#### 2.3 Endpoints cho organizer assets (admin/jury)
**(1) Initiate assets**: `POST /api/v1/phases/:id/assets:initiate`
- Input: `{ assets: [{asset_key, filename, content_type, size_bytes}] }`
- Object keys: `phases/{phase_id}/{asset_key}/{filename}`.
- Output: presigned PUT URLs.

**(2) Complete assets**: `POST /api/v1/phases/:id/assets/complete`
- Upsert vào `phase_assets`.

### 3) Worker: tải artifacts từ MinIO/S3 và chạy runner theo phase
#### 3.1 Worker config
- Thêm env cho worker:
  - `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`
- Add python dependency: `minio` (minio-py).

#### 3.2 Worker DB access
- Bổ sung methods trong `backend/workers/app/db.py`:
  - `list_submission_files(conn, submission_id)`
  - `list_phase_assets(conn, phase_id)`

#### 3.3 Downloader + runner integration
- Thêm `backend/workers/app/storage.py`: download object theo key về local temp dir.
- Update `backend/workers/app/worker_judge.py`:
  - Fetch submission + list submission_files + list phase_assets.
  - Download hết vào temp dir.
  - Nếu `phase.is_final=false`: chạy judge với `predictions.csv` (submission) + `ground_truth.csv` + `judge.py` (phase assets).
  - Nếu `phase.is_final=true`: unzip submission zip, chạy infer, rồi judge.
- Refactor `backend/workers/app/runner.py` để nhận path thay vì hardcode `/demo`.

### 4) Docker-compose dev wiring
- Update `backend/docker-compose.yml`:
  - Add `S3_PUBLIC_ENDPOINT` cho api.
  - Add S3 env cho worker.

## Verification (end-to-end)
1) `docker compose up -d --build`
2) Run migrations + seed contest/phase/task/entry.
3) Upload organizer assets: initiate -> PUT -> complete.
4) Create submission (contestant): initiate -> PUT -> complete.
5) Confirm status + scores + leaderboard updates.

## Notes / constraints
- Presigned URL phải dùng `S3_PUBLIC_ENDPOINT` (browser-reachable), API/worker dùng internal endpoint.
- Lean V1: chưa có retry/DLQ/sweeper.
