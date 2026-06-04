"""
bench_setup.py — Setup đầy đủ cho benchmark thực nghiệm

Làm 4 việc theo thứ tự:
  1. Upload BTC assets (judge.py, ground_truth, inputs) cho cả 2 tasks
  2. Upload task assets (judge.py)
  3. Đăng ký contestants (sv001–sv020), auto-approve
  4. Submit bài mẫu cho từng contestant (nhiều điểm khác nhau để tạo leaderboard)

Cách chạy:
  pip install httpx
  python demo/bench_setup.py

Sau khi chạy xong:
  python demo/leaderboard_benchmark.py --api http://localhost:8080
"""
from __future__ import annotations

import csv
import io
import os
import random
import time
import zipfile
import tempfile
from pathlib import Path

import httpx

# ── Config ─────────────────────────────────────────────────────────────────
API      = "http://localhost:8080"
DRAFT    = Path(__file__).parent.parent.parent / "draft"
PASSWORD = "password"

CONTEST_ID = "5e5cf8b9-f2e9-4527-8ace-e648a1042944"

TASKS = {
    "zhvi": {
        "task_id":   "9e664afd-9553-4a07-9299-38088c9f77bf",
        "phases": [
            # (phase_id, eval_set_id, is_final, label)
            ("1753d416-6d56-454a-bd72-5acfc79de2e2", "0f954214-57bd-472a-99de-469184d95907", False, "public_test"),
            ("8a00a38e-a56b-46e5-a43c-4aef182512cb", "c7a3f026-9d83-41bf-82ce-01df1e3fe22b", False, "private_test"),
        ],
        "judge_py":   DRAFT / "btc_upload" / "judge_worker.py",  # worker-compatible format
        "eval_sets": {
            "0f954214-57bd-472a-99de-469184d95907": {
                "ground_truth": DRAFT / "btc_upload" / "ground_truth.csv",
                "inputs":       DRAFT / "btc_upload" / "inputs.csv",
            },
            "c7a3f026-9d83-41bf-82ce-01df1e3fe22b": {
                "ground_truth": DRAFT / "btc_upload" / "ground_truth.csv",
                "inputs":       DRAFT / "btc_upload" / "inputs.csv",
            },
        },
        "submissions": [
            DRAFT / "contestant_submissions" / "perfect_predictions.csv",
            DRAFT / "contestant_submissions" / "good_predictions.csv",
            DRAFT / "contestant_submissions" / "average_predictions.csv",
            DRAFT / "contestant_submissions" / "poor_predictions.csv",
        ],
    },
    "sudoku": {
        "task_id":   "09af0c14-ce35-429e-a668-ec4b3685b3f6",
        "phases": [
            ("ff85852d-45ab-458f-b525-7eb97c4756a1", "a10c0b8f-847f-4e6c-b8f6-d1b95b773fdb", False, "public_test"),
            ("8ba8d491-6890-45c0-8f58-ab289fc3686a", "97e0f904-a5db-4b90-b93c-e47503ec1e0a", False, "private_test"),
        ],
        "judge_py":   DRAFT / "contract-driven-demo-sudoku" / "organizer" / "judge.py",
        "eval_sets": {
            "a10c0b8f-847f-4e6c-b8f6-d1b95b773fdb": {
                "ground_truth": DRAFT / "contract-driven-demo-sudoku" / "organizer" / "public" / "ground_truth.zip",
                "inputs":       DRAFT / "contract-driven-demo-sudoku" / "organizer" / "public" / "inputs.zip",
            },
            "97e0f904-a5db-4b90-b93c-e47503ec1e0a": {
                "ground_truth": DRAFT / "contract-driven-demo-sudoku" / "organizer" / "private" / "ground_truth.zip",
                "inputs":       DRAFT / "contract-driven-demo-sudoku" / "organizer" / "private" / "inputs.zip",
            },
        },
        "submissions": [
            DRAFT / "contract-driven-demo-sudoku" / "contestant" / "non_final_public_submission.zip",
            DRAFT / "contract-driven-demo-sudoku" / "contestant" / "non_final_private_submission.zip",
        ],
    },
}

N_CONTESTANTS = 20  # sv001 → sv020


# ── Helpers ─────────────────────────────────────────────────────────────────

def login(email: str, password: str = PASSWORD) -> str:
    r = httpx.post(f"{API}/api/v1/auth/login",
                   json={"email": email, "password": password}, timeout=10)
    r.raise_for_status()
    tok = r.json()["token"]
    return tok["access_token"] if isinstance(tok, dict) else tok


def upload_file(put_url: str, filepath: Path) -> None:
    """Upload a file to MinIO via presigned PUT URL."""
    content_type = "application/zip" if filepath.suffix == ".zip" else "text/plain"
    with open(filepath, "rb") as f:
        data = f.read()
    r = httpx.put(put_url, content=data,
                  headers={"Content-Type": content_type}, timeout=120)
    if r.status_code not in (200, 204):
        raise RuntimeError(f"Upload failed {r.status_code}: {r.text[:200]}")


def upload_single_file_as_zip(put_url: str, filepath: Path) -> None:
    """Wrap a CSV in a zip and upload (for submission files)."""
    if filepath.suffix == ".zip":
        upload_file(put_url, filepath)
        return
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        tmp_path = tmp.name
    with zipfile.ZipFile(tmp_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(filepath, filepath.name)
    try:
        upload_file(put_url, Path(tmp_path))
    finally:
        os.unlink(tmp_path)


def upload_bytes_as_zip(put_url: str, filename: str, content: bytes) -> None:
    """Upload in-memory bytes as a zip file to MinIO presigned URL."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr(filename, content)
    data = buf.getvalue()
    r = httpx.put(put_url, content=data,
                  headers={"Content-Type": "application/zip"}, timeout=60)
    if r.status_code not in (200, 204):
        raise RuntimeError(f"Upload failed {r.status_code}")


def generate_zhvi_prediction(contestant_idx: int, gt_path: Path) -> bytes:
    """
    Generate a prediction CSV with controlled accuracy for ZHVI.
    contestant_idx 0 → worst, N-1 → best.
    Ground truth: id,y_true
    """
    gt = {}
    with open(gt_path) as f:
        for row in csv.DictReader(f):
            gt[row["id"]] = int(row["y_true"])

    ids = sorted(gt.keys(), key=lambda s: int(s))
    n = len(ids)
    # How many correct answers for this contestant (spread evenly)
    n_correct = int((contestant_idx / max(N_CONTESTANTS - 1, 1)) * n + 0.5)
    n_correct = max(0, min(n, n_correct))

    # Make n_correct predictions correct, rest flipped
    correct_ids = set(ids[:n_correct])
    rows = []
    for i in ids:
        if i in correct_ids:
            rows.append(f"{i},{gt[i]}")
        else:
            rows.append(f"{i},{1 - gt[i]}")  # wrong answer

    csv_content = "id,y_pred\n" + "\n".join(rows) + "\n"
    return csv_content.encode()


def generate_sudoku_prediction(contestant_idx: int, base_file: Path) -> bytes:
    """Use base submission but add slight variation by contestant index."""
    with open(base_file, "rb") as f:
        return f.read()


# ── Step 1: Upload BTC assets ────────────────────────────────────────────────

def upload_btc_assets(admin_token: str) -> None:
    print("\n[Step 1] Uploading BTC assets (judge.py, ground_truth, inputs)...")
    headers = {"Authorization": f"Bearer {admin_token}",
               "Content-Type": "application/json"}

    for task_name, cfg in TASKS.items():
        print(f"  Task: {task_name}")

        # Upload task asset: judge.py
        task_id = cfg["task_id"]
        judge_path = cfg["judge_py"]
        if judge_path.exists():
            # asset_key MUST match judge_key used by the phase (usually "judge.py")
            r = httpx.post(
                f"{API}/api/v1/tasks/{task_id}/assets:initiate",
                json={"assets": [{"asset_key": "judge.py", "filename": "judge.py",
                                  "size": judge_path.stat().st_size}]},
                headers=headers, timeout=15
            )
            if r.status_code == 200:
                for u in r.json().get("uploads", []):
                    upload_file(u["put_url"], judge_path)
                    # Complete
                    httpx.post(
                        f"{API}/api/v1/tasks/{task_id}/assets/complete",
                        json={"assets": [{"asset_key": "judge.py",
                                          "filename": "judge.py",
                                          "object_key": u["object_key"],
                                          "size_bytes": judge_path.stat().st_size,
                                          "content_type": "text/plain"}]},
                        headers=headers, timeout=10
                    )
                print(f"    ✓ judge.py uploaded")
            else:
                print(f"    ⚠ task asset initiate: {r.status_code} {r.text[:100]}")

        # Upload evaluation set assets
        for eval_set_id, assets in cfg["eval_sets"].items():
            asset_list = []
            for key, path in assets.items():
                if path.exists():
                    asset_list.append({
                        "asset_key": key,
                        "filename":  path.name,
                        "size":      path.stat().st_size,
                    })

            if not asset_list:
                continue

            r = httpx.post(
                f"{API}/api/v1/evaluation-sets/{eval_set_id}/assets:initiate",
                json={"assets": asset_list},
                headers=headers, timeout=15
            )
            if r.status_code != 200:
                print(f"    ⚠ eval-set {eval_set_id[:8]} initiate: {r.status_code} {r.text[:100]}")
                continue

            complete_list = []
            for u in r.json().get("uploads", []):
                path = assets.get(u["asset_key"])
                if path and path.exists():
                    upload_file(u["put_url"], path)
                    complete_list.append({
                        "asset_key":    u["asset_key"],
                        "filename":     u["filename"],
                        "object_key":   u["object_key"],
                        "size_bytes":   path.stat().st_size,
                        "content_type": "application/zip" if path.suffix == ".zip" else "text/plain",
                    })

            if complete_list:
                httpx.post(
                    f"{API}/api/v1/evaluation-sets/{eval_set_id}/assets/complete",
                    json={"assets": complete_list},
                    headers=headers, timeout=10
                )
                print(f"    ✓ eval-set {eval_set_id[:8]}: {[c['asset_key'] for c in complete_list]}")


# ── Step 2: Register + approve contestants ───────────────────────────────────

def setup_contestants(admin_token: str) -> list[dict]:
    """Register sv001–svN into the contest, auto-approve. Handles already-registered case."""
    print(f"\n[Step 2] Registering {N_CONTESTANTS} contestants...")
    admin_headers = {"Authorization": f"Bearer {admin_token}",
                     "Content-Type": "application/json"}

    # Build user_id → entry_id map from existing entries
    existing: dict[str, str] = {}  # user_id → entry_id
    er = httpx.get(f"{API}/api/v1/contests/{CONTEST_ID}/entries",
                   headers=admin_headers, timeout=15)
    if er.status_code == 200:
        for e in (er.json() if isinstance(er.json(), list) else []):
            for m in e.get("members", []):
                existing[m.get("user_id", m.get("id", ""))] = e["id"]

    contestants = []
    for i in range(1, N_CONTESTANTS + 1):
        email = f"sv{i:03d}@bkdn.edu.vn"
        try:
            token = login(email)
        except Exception:
            print(f"  ⚠ Cannot login {email}")
            continue

        user_headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
        me_r = httpx.get(f"{API}/api/v1/auth/me", headers=user_headers, timeout=10)
        if me_r.status_code != 200:
            continue
        user_id = me_r.json().get("id")

        # Try to find existing entry for this user
        display_name = f"Team SV{i:03d}"
        existing_entry_id = None
        er = httpx.get(
            f"{API}/api/v1/contests/{CONTEST_ID}/entries",
            headers=user_headers, timeout=10
        )
        if er.status_code == 200:
            for e in (er.json() if isinstance(er.json(), list) else []):
                if e.get("display_name") == display_name:
                    existing_entry_id = e["id"]
                    break

        if existing_entry_id:
            print(f"  ↩ {email} already registered → {existing_entry_id[:8]}")
            contestants.append({"email": email, "token": token, "entry_id": existing_entry_id})
            continue

        r = httpx.post(
            f"{API}/api/v1/contests/{CONTEST_ID}/entries",
            json={"display_name": display_name, "entry_type": "individual",
                  "entry_mode": "official", "user_id": user_id},
            headers=user_headers, timeout=10
        )
        if r.status_code in (200, 201):
            entry_id = r.json().get("id") or r.json().get("entry_id")
            httpx.post(f"{API}/api/v1/entries/{entry_id}/approve",
                       headers=admin_headers, timeout=10)
            print(f"  ✓ {email} → {entry_id[:8] if entry_id else '?'}")
            contestants.append({"email": email, "token": token, "entry_id": entry_id})
        else:
            print(f"  ⚠ {email}: {r.status_code} {r.text[:60]}")

    print(f"  → {len(contestants)} contestants ready")
    return contestants


# ── Step 3: Submit bài cho từng contestant ───────────────────────────────────

def submit_for_all(contestants: list[dict]) -> int:
    """Submit sample files for each contestant across all phases."""
    print(f"\n[Step 3] Submitting for {len(contestants)} contestants...")
    total = 0

    gt_zhvi = DRAFT / "btc_upload" / "ground_truth.csv"

    for task_name, cfg in TASKS.items():
        task_id = cfg["task_id"]
        submissions = cfg["submissions"]
        phases = [(p[0], p[1], p[2], p[3]) for p in cfg["phases"]]

        for phase_id, eval_set_id, is_final, phase_label in phases:
            if is_final:
                continue  # Skip final phases (need Docker sandbox)

            print(f"  Task={task_name} phase={phase_label}")

            for idx, c in enumerate(contestants):
                headers = {"Authorization": f"Bearer {c['token']}",
                           "Content-Type": "application/json"}

                # Generate unique prediction per contestant for diverse scores
                if task_name == "zhvi":
                    filename = f"predictions_{idx:03d}.csv"
                    payload_bytes = generate_zhvi_prediction(idx, gt_zhvi)
                    est_size = len(payload_bytes)
                    use_bytes = True
                    use_raw = True   # ZHVI cần raw CSV, không wrap zip
                else:
                    sub_file = submissions[idx % len(submissions)]
                    if not sub_file.exists():
                        continue
                    filename = sub_file.name
                    est_size = sub_file.stat().st_size
                    use_bytes = False
                    use_raw = False

                r = httpx.post(
                    f"{API}/api/v1/entries/{c['entry_id']}/submissions:initiate",
                    json={"task_id": task_id, "phase_id": phase_id,
                          "files": [{"filename": filename, "size": est_size}]},
                    headers=headers, timeout=15
                )
                if r.status_code not in (200, 201):
                    print(f"    ⚠ {c['email'][:10]}: {r.status_code} {r.text[:80]}")
                    continue

                body = r.json()
                sub_id = body.get("submission_id")
                uploads = body.get("uploads", [])
                if not uploads or not sub_id:
                    continue

                u = uploads[0]
                try:
                    if use_bytes and use_raw:
                        # ZHVI: upload raw CSV (no zip wrapper)
                        r2 = httpx.put(u["put_url"], content=payload_bytes,
                                       headers={"Content-Type": "text/csv"}, timeout=30)
                        if r2.status_code not in (200, 204):
                            raise RuntimeError(f"Upload {r2.status_code}")
                        content_type = "text/csv"
                        actual_size = len(payload_bytes)
                    elif use_bytes:
                        upload_bytes_as_zip(u["put_url"], filename, payload_bytes)
                        content_type = "application/zip"
                        actual_size = len(payload_bytes) + 200
                    else:
                        upload_single_file_as_zip(u["put_url"], sub_file)
                        content_type = "application/zip"
                        actual_size = sub_file.stat().st_size
                except Exception as e:
                    print(f"    ⚠ upload: {e}")
                    continue

                cr = httpx.post(
                    f"{API}/api/v1/submissions/{sub_id}/complete",
                    json={"files": [{
                        "filename":     filename,
                        "object_key":   u["object_key"],
                        "size_bytes":   max(1, actual_size),
                        "content_type": content_type,
                    }]},
                    headers=headers, timeout=10
                )
                if cr.status_code in (200, 201):
                    total += 1
                    if idx < 3:  # preview first 3
                        n_correct = int((idx / max(N_CONTESTANTS - 1, 1)) * 6 + 0.5)
                        print(f"    sv{idx+2:03d}: {n_correct}/6 correct (score≈{n_correct/6:.2f})")
                else:
                    print(f"    ⚠ {sub_id[:8]}: {cr.status_code} {cr.text[:60]}")

                time.sleep(0.1)

            print(f"    ✓ {total} total submissions so far")

    return total


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print("=" * 60)
    print("OLPAI Benchmark Setup")
    print(f"Contest: {CONTEST_ID}")
    print("=" * 60)

    admin_token = login("admin@local.com")
    print(f"✓ Admin logged in")

    upload_btc_assets(admin_token)
    contestants = setup_contestants(admin_token)

    if not contestants:
        print("✗ No contestants available. Exiting.")
        return

    total = submit_for_all(contestants)

    print(f"\n{'='*60}")
    print(f"✓ Done! {total} submissions created")
    print(f"\nWait ~30s for workers to process, then read metrics:")
    print(f"  python demo/leaderboard_benchmark.py --api {API}")
    print(f"  curl -s {API}/metrics | grep '^olpai_'")
    print("=" * 60)


if __name__ == "__main__":
    main()
