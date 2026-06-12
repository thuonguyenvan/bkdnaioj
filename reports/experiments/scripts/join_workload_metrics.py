from __future__ import annotations

import argparse
import csv
from pathlib import Path

from common import RESULTS_DIR, percentile, write_csv, write_markdown_table


def read_csv(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def as_float(value: object) -> float | None:
    try:
        if value in (None, ""):
            return None
        return float(value)
    except (TypeError, ValueError):
        return None


def main() -> None:
    parser = argparse.ArgumentParser(description="Join workload labels with lifecycle/runtime metrics")
    parser.add_argument("--workload-csv", required=True)
    parser.add_argument("--lifecycle-csv", required=True)
    parser.add_argument("--prefix", default="joined_workload")
    args = parser.parse_args()

    workload = {
        row["submission_id"]: row
        for row in read_csv(Path(args.workload_csv))
        if row.get("submission_id")
    }
    joined = []
    for row in read_csv(Path(args.lifecycle_csv)):
        meta = workload.get(row.get("submission_id"), {})
        label = meta.get("label", "")
        workload_class = meta.get("workload_class") or label
        joined.append({
            **row,
            "label": label,
            "workload_class": workload_class,
            "expected_status": meta.get("expected_status", ""),
        })

    groups: dict[str, list[dict]] = {}
    for row in joined:
        groups.setdefault(row["workload_class"] or "unknown", []).append(row)

    summary = []
    for group, rows in sorted(groups.items()):
        waits = [v for v in (as_float(r.get("queue_wait_seconds")) for r in rows) if v is not None]
        runtimes = [v for v in (as_float(r.get("worker_runtime_seconds")) for r in rows) if v is not None]
        freshness = [v for v in (as_float(r.get("leaderboard_freshness_seconds")) for r in rows) if v is not None]
        terminal = [r for r in rows if r.get("status") in {"done", "failed"}]
        done = [r for r in rows if r.get("status") == "done"]
        summary.append({
            "workload_class": group,
            "jobs": len(rows),
            "terminal": len(terminal),
            "done": len(done),
            "failed": len(terminal) - len(done),
            "success_rate": len(done) / len(terminal) if terminal else None,
            "queue_wait_median": percentile(waits, 0.5),
            "queue_wait_p95": percentile(waits, 0.95),
            "runtime_median": percentile(runtimes, 0.5),
            "runtime_p95": percentile(runtimes, 0.95),
            "leaderboard_freshness_p95": percentile(freshness, 0.95),
        })

    write_csv(RESULTS_DIR / f"{args.prefix}_joined.csv", joined)
    write_csv(RESULTS_DIR / f"{args.prefix}_summary.csv", summary)
    write_markdown_table(RESULTS_DIR / f"{args.prefix}_summary.md", summary, "Workload Class Summary")
    print(RESULTS_DIR / f"{args.prefix}_summary.csv")


if __name__ == "__main__":
    main()
