#!/usr/bin/env bash
set -euo pipefail

# Lean V1 dev smoke: seed DB, enqueue a submission, watch it become done, and verify leaderboard row exists.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "[1/6] Starting services (db, redis, minio, api, worker-judge)..."
docker compose up -d --build

echo "[2/6] Running migrations..."
make migrate-up

echo "[3/6] Seeding Lean V1 demo data..."
docker compose exec -T db psql -U olpai -d olpai -f - < scripts/seed_lean_v1.sql

echo "[4/6] Enqueueing submission_id(s) into jobs:judge..."
PAYLOAD_PUBLIC='{"submission_id":"88888888-8888-8888-8888-888888888888"}'
PAYLOAD_FINAL='{"submission_id":"f9999999-9999-9999-9999-999999999999"}'
docker compose exec -T redis redis-cli XADD jobs:judge '*' payload "$PAYLOAD_PUBLIC" >/dev/null
docker compose exec -T redis redis-cli XADD jobs:judge '*' payload "$PAYLOAD_FINAL"  >/dev/null

echo "[5/6] Waiting for worker to mark submissions done..."
for i in {1..60}; do
  STATUS_PUBLIC=$(docker compose exec -T db psql -U olpai -d olpai -t -A -c "select status from submissions where id='88888888-8888-8888-8888-888888888888';")
  STATUS_FINAL=$(docker compose exec -T db psql -U olpai -d olpai -t -A -c "select status from submissions where id='f9999999-9999-9999-9999-999999999999';")
  echo "  public=$STATUS_PUBLIC final=$STATUS_FINAL"
  if [[ "$STATUS_PUBLIC" == "done" && "$STATUS_FINAL" == "done" ]]; then
    break
  fi
  sleep 0.5
done

echo "[6/6] Inspecting rows..."

echo "Submission (public) row:"
docker compose exec -T db psql -U olpai -d olpai -c "select id,status,raw_score,display_score,evaluated_at,error_message from submissions where id='88888888-8888-8888-8888-888888888888';"

echo "Submission (final) row:"
docker compose exec -T db psql -U olpai -d olpai -c "select id,status,raw_score,display_score,evaluated_at,error_message from submissions where id='f9999999-9999-9999-9999-999999999999';"

echo "Task-phase leaderboard row (public phase):"
docker compose exec -T db psql -U olpai -d olpai -c "select phase_id,contest_entry_id,rank,score,chosen_submission_id from task_phase_leaderboard_entries where phase_id='66666666-6666-6666-6666-666666666666';"

echo "Task-phase leaderboard row (final phase):"
docker compose exec -T db psql -U olpai -d olpai -c "select phase_id,contest_entry_id,rank,score,chosen_submission_id from task_phase_leaderboard_entries where phase_id='99999999-9999-9999-9999-999999999999';"

echo "Contest-phase leaderboard row (public):"
docker compose exec -T db psql -U olpai -d olpai -c "select contest_phase_def_id,contest_entry_id,rank,score from contest_phase_leaderboard_entries where contest_phase_def_id='33333333-3333-3333-3333-333333333333';"

echo "Contest-phase leaderboard row (private/final):"
docker compose exec -T db psql -U olpai -d olpai -c "select contest_phase_def_id,contest_entry_id,rank,score from contest_phase_leaderboard_entries where contest_phase_def_id='44444444-4444-4444-4444-444444444444';"

echo "Done."
