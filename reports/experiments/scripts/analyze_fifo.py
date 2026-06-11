from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from common import RESULTS_DIR, percentile, write_csv, write_markdown_table


def read_csv(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def concurrency_stats(intervals: list[tuple[datetime, datetime]]) -> tuple[int, float, float]:
    if not intervals:
        return 0, 0.0, 0.0
    points: list[tuple[datetime, int]] = []
    busy_seconds = 0.0
    for start, end in intervals:
        if end < start:
            continue
        points.append((start, 1))
        points.append((end, -1))
        busy_seconds += (end - start).total_seconds()
    points.sort(key=lambda item: (item[0], item[1]))
    active = 0
    peak = 0
    for _, delta in points:
        active += delta
        peak = max(peak, active)
    window = (max(end for _, end in intervals) - min(start for start, _ in intervals)).total_seconds()
    average = busy_seconds / window if window > 0 else 0.0
    return peak, average, window


def capability_slots(worker: dict) -> tuple[int, int, int]:
    max_workers = int(worker.get("max_workers") or 0)
    raw = worker.get("capabilities") or "{}"
    try:
        capabilities = json.loads(raw) if isinstance(raw, str) else raw
    except json.JSONDecodeError:
        capabilities = {}
    output_slots = int(capabilities.get("max_output_slots") or max_workers)
    inference_slots = int(capabilities.get("max_inference_slots") or 0)
    return max_workers, output_slots, inference_slots


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze capability-aware FIFO utilization")
    parser.add_argument("--lifecycle-csv", required=True)
    parser.add_argument("--workers-csv", required=True)
    parser.add_argument("--prefix", default="fifo")
    args = parser.parse_args()

    lifecycle = read_csv(Path(args.lifecycle_csv))
    workers = {row["id"]: row for row in read_csv(Path(args.workers_csv))}

    all_intervals: list[tuple[datetime, datetime]] = []
    by_worker: dict[str, list[tuple[datetime, datetime]]] = defaultdict(list)
    by_worker_rows: dict[str, list[dict]] = defaultdict(list)
    for row in lifecycle:
        start = parse_time(row.get("claimed_at"))
        end = parse_time(row.get("result_received_at"))
        worker_id = row.get("worker_id")
        if start and end and worker_id:
            all_intervals.append((start, end))
            by_worker[worker_id].append((start, end))
            by_worker_rows[worker_id].append(row)

    peak, average, window = concurrency_stats(all_intervals)
    terminal = [row for row in lifecycle if row.get("status") in {"done", "failed"}]
    successful = [row for row in lifecycle if row.get("status") == "done"]
    waits = [float(row["queue_wait_seconds"]) for row in terminal if row.get("queue_wait_seconds")]
    summary = [{
        "jobs": len(lifecycle),
        "done": len(successful),
        "failed": len(terminal) - len(successful),
        "success_rate": len(successful) / len(terminal) if terminal else None,
        "window_seconds": window,
        "terminal_throughput_per_min": len(terminal) * 60 / window if window else None,
        "successful_throughput_per_min": len(successful) * 60 / window if window else None,
        "peak_concurrent_jobs": peak,
        "average_concurrent_jobs": average,
        "queue_wait_median": percentile(waits, 0.5),
        "queue_wait_p95": percentile(waits, 0.95),
    }]

    worker_rows = []
    for worker_id, intervals in sorted(by_worker.items()):
        worker = workers.get(worker_id, {})
        max_workers, output_slots, inference_slots = capability_slots(worker)
        worker_peak, worker_average, worker_window = concurrency_stats(intervals)
        rows = by_worker_rows[worker_id]
        runtimes = [
            float(row["worker_runtime_seconds"])
            for row in rows
            if row.get("worker_runtime_seconds")
        ]
        worker_rows.append({
            "worker_name": rows[0].get("worker_name") or worker.get("display_name"),
            "max_workers": max_workers,
            "output_slots": output_slots,
            "inference_slots": inference_slots,
            "jobs": len(rows),
            "done": sum(row.get("status") == "done" for row in rows),
            "failed": sum(row.get("status") == "failed" for row in rows),
            "output_jobs": sum(row.get("is_final", "").lower() == "false" for row in rows),
            "final_jobs": sum(row.get("is_final", "").lower() == "true" for row in rows),
            "peak_active": worker_peak,
            "average_active": worker_average,
            "slot_utilization": worker_average / max_workers if max_workers else None,
            "runtime_median": percentile(runtimes, 0.5),
            "runtime_p95": percentile(runtimes, 0.95),
            "active_window_seconds": worker_window,
        })

    summary_csv = RESULTS_DIR / f"{args.prefix}_fifo_summary.csv"
    summary_md = RESULTS_DIR / f"{args.prefix}_fifo_summary.md"
    workers_csv = RESULTS_DIR / f"{args.prefix}_fifo_workers.csv"
    workers_md = RESULTS_DIR / f"{args.prefix}_fifo_workers.md"
    write_csv(summary_csv, summary)
    write_csv(workers_csv, worker_rows)
    write_markdown_table(summary_md, summary, "Capability-aware FIFO Summary")
    write_markdown_table(workers_md, worker_rows, "FIFO Worker Utilization")
    print(f"wrote {summary_csv}")
    print(f"wrote {workers_csv}")


if __name__ == "__main__":
    main()
