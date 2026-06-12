from __future__ import annotations

import argparse
import json
import shlex
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import httpx

from common import RESULTS_DIR, auth_headers, connect, load_json, write_csv, write_markdown_table
from run_workload import authenticate_users, submit_file


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_ssh(ssh: str, command: str) -> tuple[int, str]:
    argv = shlex.split(ssh) + [command]
    result = subprocess.run(argv, capture_output=True, text=True, timeout=60)
    return result.returncode, (result.stdout + result.stderr).strip()


def claim_for_submission(submission_id: str) -> dict | None:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT e.created_at AS claimed_at,
                   e.worker_id::text,
                   w.display_name AS worker_name,
                   w.last_seen_at,
                   c.claimed_at AS db_claimed_at,
                   c.last_heartbeat_at,
                   c.lease_expires_at
            FROM experiment_events e
            LEFT JOIN volunteer_workers w ON w.id = e.worker_id
            LEFT JOIN volunteer_worker_claims c ON c.submission_id = e.submission_id
            WHERE e.submission_id = %(submission_id)s::uuid
              AND e.event_type = 'job_claimed'
            ORDER BY e.created_at DESC
            LIMIT 1
            """,
            {"submission_id": submission_id},
        ).fetchone()
    return dict(row) if row else None


def status_for_submission(submission_id: str) -> dict:
    with connect() as conn:
        row = conn.execute(
            """
            SELECT s.id::text, s.status::text, s.raw_score, s.display_score,
                   s.error_message,
                   count(e.*) FILTER (WHERE e.event_type = 'job_requeued') AS requeue_count,
                   max(e.created_at) FILTER (WHERE e.event_type = 'job_requeued') AS last_requeued_at,
                   max(e.created_at) FILTER (WHERE e.event_type = 'result_committed') AS result_committed_at,
                   count(e.*) FILTER (WHERE e.event_type = 'result_committed') AS result_commit_events
            FROM submissions s
            LEFT JOIN experiment_events e ON e.submission_id = s.id
            WHERE s.id = %(submission_id)s::uuid
            GROUP BY s.id
            """,
            {"submission_id": submission_id},
        ).fetchone()
    return dict(row) if row else {"id": submission_id, "status": "missing"}


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a controlled worker-kill recovery probe")
    parser.add_argument("--manifest", required=True, help="Single-job workload manifest")
    parser.add_argument("--ssh", required=True, help="SSH command prefix, e.g. 'ssh -p 57215 root@host'")
    parser.add_argument("--kill-cmd", default="pkill -f 'olpai-volunteer'")
    parser.add_argument("--restart-cmd", default="")
    parser.add_argument("--expected-worker-name", default="")
    parser.add_argument("--claim-timeout-s", type=int, default=180)
    parser.add_argument("--result-timeout-s", type=int, default=1800)
    parser.add_argument("--confirm-kill", action="store_true")
    parser.add_argument("--out-prefix", default="fault_recovery")
    args = parser.parse_args()

    if not args.confirm_kill:
        raise RuntimeError("pass --confirm-kill to execute the kill command")

    manifest = load_json(args.manifest)
    if len(manifest["jobs"]) != 1:
        raise RuntimeError("fault recovery manifest must contain exactly one job")
    manifest["users"] = authenticate_users(manifest.get("base_url", "https://api.bkdnaioj.app").rstrip("/"), manifest["users"])
    user = manifest["users"][0]
    job = manifest["jobs"][0]
    base_url = manifest.get("base_url", "https://api.bkdnaioj.app").rstrip("/")
    token = user["token"]

    rows: list[dict] = []
    with httpx.Client(timeout=120) as client:
        submitted_at = now_iso()
        submission_id = submit_file(client, base_url, token, user["entry_id"], job)
        rows.append({"event": "submitted", "at": submitted_at, "submission_id": submission_id})

        deadline = time.monotonic() + args.claim_timeout_s
        claim = None
        while time.monotonic() < deadline:
            claim = claim_for_submission(submission_id)
            if claim:
                break
            time.sleep(1)
        if not claim:
            raise RuntimeError(f"submission was not claimed within {args.claim_timeout_s}s: {submission_id}")
        rows.append({"event": "claimed", "at": now_iso(), "submission_id": submission_id, **claim})
        if args.expected_worker_name and claim.get("worker_name") != args.expected_worker_name:
            rows.append({
                "event": "kill_skipped",
                "at": now_iso(),
                "submission_id": submission_id,
                "reason": f"claimed by {claim.get('worker_name')}, expected {args.expected_worker_name}",
            })
            RESULTS_DIR.mkdir(parents=True, exist_ok=True)
            out_csv = RESULTS_DIR / f"{args.out_prefix}.csv"
            out_md = RESULTS_DIR / f"{args.out_prefix}.md"
            write_csv(out_csv, rows)
            write_markdown_table(out_md, rows, "Fault Recovery Probe")
            print(json.dumps({"submission_id": submission_id, "csv": str(out_csv), "skipped": True}, default=str, indent=2))
            return

        killed_at = now_iso()
        code, output = run_ssh(args.ssh, args.kill_cmd)
        rows.append({
            "event": "worker_killed",
            "at": killed_at,
            "submission_id": submission_id,
            "ssh_exit_code": code,
            "ssh_output": output[:1000],
        })

        result_deadline = time.monotonic() + args.result_timeout_s
        final_status = None
        while time.monotonic() < result_deadline:
            final_status = status_for_submission(submission_id)
            rows.append({"event": "status_poll", "at": now_iso(), **final_status})
            if final_status.get("status") in {"done", "failed"} and int(final_status.get("requeue_count") or 0) > 0:
                break
            time.sleep(10)

        if args.restart_cmd:
            code, output = run_ssh(args.ssh, args.restart_cmd)
            rows.append({
                "event": "worker_restart_command",
                "at": now_iso(),
                "submission_id": submission_id,
                "ssh_exit_code": code,
                "ssh_output": output[:1000],
            })

    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    out_csv = RESULTS_DIR / f"{args.out_prefix}.csv"
    out_md = RESULTS_DIR / f"{args.out_prefix}.md"
    write_csv(out_csv, rows)
    write_markdown_table(out_md, rows, "Fault Recovery Probe")
    print(json.dumps({"submission_id": submission_id, "csv": str(out_csv), "final_status": final_status}, default=str, indent=2))


if __name__ == "__main__":
    main()
