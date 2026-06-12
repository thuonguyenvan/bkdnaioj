from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from common import RESULTS_DIR, write_csv, write_markdown_table


def first_row(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return next(csv.DictReader(handle))


def metric_value(summary: dict, name: str, key: str):
    metric = summary.get("metrics", {}).get(name, {})
    value = metric.get("values", {}).get(key, metric.get(key))
    if value is None and key == "rate":
        value = metric.get("value")
    return value


def main() -> None:
    parser = argparse.ArgumentParser(description="Combine Chapter 5 burst and K6 summaries")
    parser.add_argument("--burst", action="append", default=[], help="N:path/to/fifo_summary.csv")
    parser.add_argument("--k6", action="append", default=[], help="VUS:path/to/k6_summary.json")
    args = parser.parse_args()

    burst_rows = []
    for spec in args.burst:
        label, raw_path = spec.split(":", 1)
        row = first_row(Path(raw_path))
        burst_rows.append({
            "batch": int(label),
            "success_rate": float(row["success_rate"]),
            "queue_wait_median": float(row["queue_wait_median"]),
            "queue_wait_p95": float(row["queue_wait_p95"]),
            "peak_concurrent_jobs": int(row["peak_concurrent_jobs"]),
            "average_concurrent_jobs": float(row["average_concurrent_jobs"]),
            "successful_submissions_per_min": float(row["successful_throughput_per_min"]),
        })
    burst_rows.sort(key=lambda row: row["batch"])

    k6_rows = []
    for spec in args.k6:
        label, raw_path = spec.split(":", 1)
        summary = json.loads(Path(raw_path).read_text(encoding="utf-8"))
        k6_rows.append({
            "virtual_users": int(label),
            "request_rate": metric_value(summary, "http_reqs", "rate"),
            "error_rate": metric_value(summary, "http_req_failed", "rate"),
            "overall_p95_ms": metric_value(summary, "http_req_duration", "p(95)"),
            "contests_p95_ms": metric_value(summary, "http_req_duration{endpoint:contests}", "p(95)"),
            "tasks_p95_ms": metric_value(summary, "http_req_duration{endpoint:tasks}", "p(95)"),
            "submissions_p95_ms": metric_value(summary, "http_req_duration{endpoint:submissions}", "p(95)"),
        })
    k6_rows.sort(key=lambda row: row["virtual_users"])

    write_csv(RESULTS_DIR / "fifo_burst_comparison.csv", burst_rows)
    write_markdown_table(
        RESULTS_DIR / "fifo_burst_comparison.md",
        burst_rows,
        "FIFO Burst Workload Comparison",
    )
    write_csv(RESULTS_DIR / "api_read_load_comparison.csv", k6_rows)
    write_markdown_table(
        RESULTS_DIR / "api_read_load_comparison.md",
        k6_rows,
        "Authenticated API Read Load",
    )
    print(f"wrote summaries to {RESULTS_DIR}")


if __name__ == "__main__":
    main()
