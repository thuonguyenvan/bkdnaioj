from __future__ import annotations

import argparse
import re
from datetime import datetime, timezone

import httpx

from common import RESULTS_DIR, connect, percentile, settings, write_csv, write_markdown_table


def fetch_prometheus() -> list[dict]:
    s = settings()
    rows: list[dict] = []
    try:
        text = httpx.get(s.metrics_url, timeout=10).text
    except Exception as exc:
        return [{"metric": "fetch_error", "labels": "", "value": str(exc)}]
    pattern = re.compile(r"^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+(.+)$")
    for line in text.splitlines():
        if line.startswith("#"):
            continue
        match = pattern.match(line.strip())
        if not match:
            continue
        name, labels, value = match.groups()
        if not name.startswith("olpai_"):
            continue
        rows.append({"metric": name, "labels": labels or "", "value": value})
    return rows


def collect_db(start: str | None, end: str | None, contest_slug: str | None) -> dict[str, list[dict]]:
    params = {
        "start": start or "1970-01-01T00:00:00Z",
        "end": end or datetime.now(timezone.utc).isoformat(),
        "contest_slug": contest_slug,
    }
    with connect() as conn:
        lifecycle = conn.execute(
            """
            WITH e AS (
              SELECT submission_id, event_type, min(created_at) AS ts
              FROM experiment_events
              WHERE created_at >= %(start)s::timestamptz
                AND created_at <= %(end)s::timestamptz
                AND submission_id IS NOT NULL
              GROUP BY submission_id, event_type
            ),
            pivot AS (
              SELECT submission_id,
                     max(ts) FILTER (WHERE event_type = 'submission_queued') AS queued_at,
                     max(ts) FILTER (WHERE event_type = 'job_claimed') AS claimed_at,
                     max(ts) FILTER (WHERE event_type = 'submission_running') AS running_at,
                     max(ts) FILTER (WHERE event_type = 'result_received') AS result_received_at,
                     max(ts) FILTER (WHERE event_type = 'result_committed') AS result_committed_at,
                     max(ts) FILTER (WHERE event_type = 'leaderboard_all_updated') AS leaderboard_updated_at,
                     count(*) FILTER (WHERE event_type = 'job_requeued') AS requeue_count
              FROM e
              GROUP BY submission_id
            )
            SELECT p.submission_id::text,
                   s.status::text,
                   phase.is_final,
                   s.total_size_bytes,
                   EXTRACT(EPOCH FROM (claimed_at - queued_at))::float AS queue_wait_seconds,
                   EXTRACT(EPOCH FROM (result_received_at - claimed_at))::float AS worker_runtime_seconds,
                   EXTRACT(EPOCH FROM (result_committed_at - result_received_at))::float AS result_commit_seconds,
                   EXTRACT(EPOCH FROM (leaderboard_updated_at - result_committed_at))::float AS leaderboard_freshness_seconds,
                   EXTRACT(EPOCH FROM (leaderboard_updated_at - queued_at))::float AS end_to_end_seconds,
                   requeue_count
            FROM pivot p
            JOIN submissions s ON s.id = p.submission_id
            JOIN phases phase ON phase.id = s.phase_id
            JOIN contests contest ON contest.id = s.contest_id
            WHERE (%(contest_slug)s::text IS NULL OR contest.slug = %(contest_slug)s)
            ORDER BY queued_at
            """,
            params,
        ).fetchall()

        runtime = conn.execute(
            """
            SELECT jel.created_at,
                   jel.submission_id::text,
                   jel.worker_id::text,
                   vw.display_name AS worker_name,
                   jel.phase_key,
                   jel.is_final,
                   jel.predicted_runtime_seconds,
                   jel.actual_runtime_seconds,
                   jel.error_ratio,
                   jel.peak_ram_bytes,
                   jel.peak_vram_bytes,
                   jel.execution_path,
                   jel.profile_payload
            FROM job_execution_logs jel
            JOIN submissions s ON s.id = jel.submission_id
            JOIN contests contest ON contest.id = s.contest_id
            LEFT JOIN volunteer_workers vw ON vw.id = jel.worker_id
            WHERE jel.created_at >= %(start)s::timestamptz
              AND jel.created_at <= %(end)s::timestamptz
              AND (%(contest_slug)s::text IS NULL OR contest.slug = %(contest_slug)s)
            ORDER BY jel.created_at
            """,
            params,
        ).fetchall()

        decisions = conn.execute(
            """
            SELECT scheduler_decision_logs.created_at,
                   scheduler_decision_logs.worker_id::text,
                   scheduler_decision_logs.selected_submission_id::text,
                   scheduler_decision_logs.strategy,
                   scheduler_decision_logs.candidates_considered,
                   scheduler_decision_logs.compatible_candidates,
                   scheduler_decision_logs.rejected_candidates,
                   scheduler_decision_logs.selected_predicted_runtime_seconds,
                   scheduler_decision_logs.selected_corrected_runtime_seconds,
                   scheduler_decision_logs.selected_cost,
                   scheduler_decision_logs.reject_summary,
                   scheduler_decision_logs.reason
            FROM scheduler_decision_logs
            LEFT JOIN submissions s ON s.id = selected_submission_id
            LEFT JOIN contests contest ON contest.id = s.contest_id
            WHERE scheduler_decision_logs.created_at >= %(start)s::timestamptz
              AND scheduler_decision_logs.created_at <= %(end)s::timestamptz
              AND (
                %(contest_slug)s::text IS NULL
                OR contest.slug = %(contest_slug)s
                OR selected_submission_id IS NULL
              )
            ORDER BY scheduler_decision_logs.created_at
            """,
            params,
        ).fetchall()

        workers = conn.execute(
            """
            SELECT id::text, display_name, status::text, max_workers,
                   capabilities, jobs_completed, jobs_failed, last_seen_at
            FROM volunteer_workers
            ORDER BY display_name
            """
        ).fetchall()

    return {
        "lifecycle": list(lifecycle),
        "runtime": list(runtime),
        "scheduler_decisions": list(decisions),
        "workers": list(workers),
        "prometheus": fetch_prometheus(),
    }


def summarize_lifecycle(rows: list[dict]) -> list[dict]:
    groups = {
        "all": rows,
        "non_final": [r for r in rows if not r.get("is_final")],
        "final": [r for r in rows if r.get("is_final")],
    }
    summary = []
    for name, items in groups.items():
        for metric in ["queue_wait_seconds", "worker_runtime_seconds", "leaderboard_freshness_seconds", "end_to_end_seconds"]:
            values = [float(r[metric]) for r in items if r.get(metric) is not None]
            summary.append({
                "group": name,
                "metric": metric,
                "count": len(values),
                "median": percentile(values, 0.5),
                "p95": percentile(values, 0.95),
                "max": max(values) if values else None,
            })
    return summary


def summarize_runtime(rows: list[dict]) -> list[dict]:
    groups: dict[tuple[str, bool], list[dict]] = {}
    for row in rows:
        groups.setdefault((row["phase_key"], row["is_final"]), []).append(row)
    out = []
    for (phase_key, is_final), items in sorted(groups.items()):
        actual = [float(r["actual_runtime_seconds"]) for r in items if r.get("actual_runtime_seconds") is not None]
        errors = [abs(float(r["error_ratio"]) - 1.0) for r in items if r.get("error_ratio") is not None]
        out.append({
            "phase_key": phase_key,
            "is_final": is_final,
            "count": len(items),
            "actual_median": percentile(actual, 0.5),
            "actual_p95": percentile(actual, 0.95),
            "mae_error_ratio": sum(errors) / len(errors) if errors else None,
        })
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect Chapter 5 experiment metrics")
    parser.add_argument("--start", help="ISO timestamp lower bound")
    parser.add_argument("--end", help="ISO timestamp upper bound")
    parser.add_argument("--prefix", default="chapter5")
    parser.add_argument("--contest-slug", help="Only collect submissions from this contest")
    args = parser.parse_args()

    data = collect_db(args.start, args.end, args.contest_slug)
    for name, rows in data.items():
        write_csv(RESULTS_DIR / f"{args.prefix}_{name}.csv", rows)

    lifecycle_summary = summarize_lifecycle(data["lifecycle"])
    runtime_summary = summarize_runtime(data["runtime"])
    write_csv(RESULTS_DIR / f"{args.prefix}_lifecycle_summary.csv", lifecycle_summary)
    write_csv(RESULTS_DIR / f"{args.prefix}_runtime_summary.csv", runtime_summary)
    write_markdown_table(RESULTS_DIR / f"{args.prefix}_lifecycle_summary.md", lifecycle_summary, "Lifecycle Latency Summary")
    write_markdown_table(RESULTS_DIR / f"{args.prefix}_runtime_summary.md", runtime_summary, "Runtime And Prediction Summary")
    print(f"wrote metrics to {RESULTS_DIR}")


if __name__ == "__main__":
    main()
