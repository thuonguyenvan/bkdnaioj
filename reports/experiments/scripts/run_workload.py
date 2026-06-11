from __future__ import annotations

import argparse
import concurrent.futures
import itertools
import random
import time
from pathlib import Path

import httpx

from common import RESULTS_DIR, ensure_dirs, load_json, write_csv


def login(client: httpx.Client, base_url: str, email: str, password: str) -> str:
    response = client.post(f"{base_url}/api/v1/auth/login", json={"email": email, "password": password})
    response.raise_for_status()
    body = response.json()
    token = body.get("token") or body
    access = token.get("access_token")
    if not access:
        raise RuntimeError(f"missing access_token for {email}: {body}")
    return access


def submit_file(client: httpx.Client, base_url: str, token: str, entry_id: str, job: dict) -> str:
    file_path = Path(job["file"])
    data = file_path.read_bytes()
    filename = job.get("filename") or file_path.name
    content_type = job.get("content_type") or "application/octet-stream"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

    init = client.post(
        f"{base_url}/api/v1/entries/{entry_id}/submissions:initiate",
        headers=headers,
        json={
            "task_id": job["task_id"],
            "phase_id": job["phase_id"],
            "files": [{
                "filename": filename,
                "content_type": content_type,
                "size_bytes": len(data),
            }],
        },
    )
    init.raise_for_status()
    init_body = init.json()
    submission_id = init_body["submission_id"]
    upload = init_body["uploads"][0]

    put = client.put(upload["put_url"], content=data, headers={"Content-Type": content_type})
    put.raise_for_status()

    complete = client.post(
        f"{base_url}/api/v1/submissions/{submission_id}/complete",
        headers=headers,
        json={
            "files": [{
                "filename": filename,
                "object_key": upload["object_key"],
                "size_bytes": len(data),
                "content_type": content_type,
            }],
        },
    )
    complete.raise_for_status()
    return submission_id


def poll_result(client: httpx.Client, base_url: str, token: str, submission_id: str, timeout_s: int) -> dict:
    headers = {"Authorization": f"Bearer {token}"}
    deadline = time.monotonic() + timeout_s
    while time.monotonic() < deadline:
        response = client.get(f"{base_url}/api/v1/submissions/{submission_id}", headers=headers)
        response.raise_for_status()
        body = response.json()
        if body.get("status") in {"done", "failed"}:
            return body
        time.sleep(1)
    return {"id": submission_id, "status": "timeout"}


def run_one(base_url: str, user: dict, job: dict, timeout_s: int) -> dict:
    started = time.time()
    with httpx.Client(timeout=120) as client:
        row = {
            "label": job.get("label", ""),
            "entry_id": user["entry_id"],
            "task_id": job["task_id"],
            "phase_id": job["phase_id"],
            "file": job["file"],
            "expected_status": job.get("expected_status", ""),
            "started_at": started,
        }
        try:
            token = user["token"]
            submission_id = submit_file(client, base_url, token, user["entry_id"], job)
            result = poll_result(client, base_url, token, submission_id, timeout_s)
            row.update({
                "submission_id": submission_id,
                "status": result.get("status"),
                "raw_score": result.get("raw_score"),
                "display_score": result.get("display_score"),
                "error_message": result.get("error_message"),
                "elapsed_seconds": round(time.time() - started, 3),
            })
        except Exception as exc:
            row.update({
                "submission_id": "",
                "status": "client_error",
                "error_message": str(exc)[:1000],
                "elapsed_seconds": round(time.time() - started, 3),
            })
        return row


def authenticate_users(base_url: str, users: list[dict]) -> list[dict]:
    authenticated = []
    with httpx.Client(timeout=120) as client:
        for user in users:
            resolved = dict(user)
            if not resolved.get("token"):
                resolved["token"] = login(
                    client,
                    base_url,
                    resolved["email"],
                    resolved["password"],
                )
            authenticated.append(resolved)
    return authenticated


def expand_jobs(manifest: dict) -> list[tuple[dict, dict]]:
    users = manifest["users"]
    expanded_jobs: list[dict] = []
    for job in manifest["jobs"]:
        for _ in range(int(job.get("repeat", 1))):
            expanded_jobs.append(job)
    if manifest.get("shuffle_seed") is not None:
        random.Random(manifest["shuffle_seed"]).shuffle(expanded_jobs)
    pairs = []
    user_cycle = itertools.cycle(users)
    for job in expanded_jobs:
        pairs.append((next(user_cycle), job))
    return pairs


def main() -> None:
    parser = argparse.ArgumentParser(description="Run Chapter 5 submission workload")
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--concurrency", type=int, default=4)
    parser.add_argument("--timeout-s", type=int, default=900)
    parser.add_argument("--out", default="")
    args = parser.parse_args()

    manifest = load_json(args.manifest)
    base_url = (manifest.get("base_url") or "https://api.bkdnaioj.app").rstrip("/")
    manifest["users"] = authenticate_users(base_url, manifest["users"])
    pairs = expand_jobs(manifest)

    rows = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as pool:
        futures = [pool.submit(run_one, base_url, user, job, args.timeout_s) for user, job in pairs]
        for future in concurrent.futures.as_completed(futures):
            row = future.result()
            rows.append(row)
            print(f"{row.get('status'):>12} {row.get('submission_id')} {row.get('label')} {row.get('elapsed_seconds')}s")

    ensure_dirs()
    out = Path(args.out) if args.out else RESULTS_DIR / f"workload_{manifest.get('name', 'run')}_{int(time.time())}.csv"
    write_csv(out, rows)
    print(f"wrote {out}")


if __name__ == "__main__":
    main()
