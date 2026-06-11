from __future__ import annotations

import argparse
import csv
from pathlib import Path

import matplotlib.pyplot as plt

from common import FIGURES_DIR, ensure_dirs


def read_csv(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def as_float(value):
    if value in (None, "", "-"):
        return None
    try:
        return float(value)
    except ValueError:
        return None


def scheduler_chart(path: Path) -> None:
    rows = read_csv(path)
    labels = [r["strategy"] for r in rows]
    p95 = [as_float(r.get("p95_wait")) or 0 for r in rows]
    median = [as_float(r.get("median_wait")) or 0 for r in rows]

    fig, ax = plt.subplots(figsize=(8, 4.5))
    x = range(len(labels))
    ax.bar([i - 0.18 for i in x], median, width=0.36, label="Median wait")
    ax.bar([i + 0.18 for i in x], p95, width=0.36, label="P95 wait")
    ax.set_xticks(list(x), labels, rotation=15, ha="right")
    ax.set_ylabel("Seconds")
    ax.set_title("Scheduling wait time by strategy")
    ax.legend()
    ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    out = FIGURES_DIR / "scheduler_wait_time.png"
    fig.savefig(out, dpi=200)
    print(f"wrote {out}")


def lifecycle_chart(path: Path) -> None:
    rows = [r for r in read_csv(path) if r.get("group") == "all"]
    labels = [r["metric"].replace("_seconds", "").replace("_", " ") for r in rows]
    p95 = [as_float(r.get("p95")) or 0 for r in rows]
    median = [as_float(r.get("median")) or 0 for r in rows]

    fig, ax = plt.subplots(figsize=(9, 4.5))
    x = range(len(labels))
    ax.plot(list(x), median, marker="o", label="Median")
    ax.plot(list(x), p95, marker="o", label="P95")
    ax.set_xticks(list(x), labels, rotation=20, ha="right")
    ax.set_ylabel("Seconds")
    ax.set_title("Submission lifecycle latency")
    ax.legend()
    ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    out = FIGURES_DIR / "lifecycle_latency.png"
    fig.savefig(out, dpi=200)
    print(f"wrote {out}")


def runtime_chart(path: Path) -> None:
    rows = read_csv(path)
    labels = [f"{r['phase_key']} {'final' if r['is_final'] == 'True' else 'non-final'}" for r in rows]
    med = [as_float(r.get("actual_median")) or 0 for r in rows]
    p95 = [as_float(r.get("actual_p95")) or 0 for r in rows]

    fig, ax = plt.subplots(figsize=(9, 4.5))
    x = range(len(labels))
    ax.bar([i - 0.18 for i in x], med, width=0.36, label="Median runtime")
    ax.bar([i + 0.18 for i in x], p95, width=0.36, label="P95 runtime")
    ax.set_xticks(list(x), labels, rotation=20, ha="right")
    ax.set_ylabel("Seconds")
    ax.set_title("Runtime by phase type")
    ax.legend()
    ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    out = FIGURES_DIR / "runtime_by_phase.png"
    fig.savefig(out, dpi=200)
    print(f"wrote {out}")

def worker_utilization_chart(path: Path) -> None:
    rows = read_csv(path)
    labels = [row["worker_name"] for row in rows]
    peak = [as_float(row.get("peak_active")) or 0 for row in rows]
    average = [as_float(row.get("average_active")) or 0 for row in rows]
    capacity = [as_float(row.get("max_workers")) or 0 for row in rows]

    fig, ax = plt.subplots(figsize=(9, 4.8))
    x = range(len(labels))
    ax.bar([i - 0.22 for i in x], average, width=0.22, label="Average active")
    ax.bar(list(x), peak, width=0.22, label="Peak active")
    ax.bar([i + 0.22 for i in x], capacity, width=0.22, label="Configured capacity")
    ax.set_xticks(list(x), labels, rotation=20, ha="right")
    ax.set_ylabel("Concurrent jobs")
    ax.set_title("Worker slot utilization under capability-aware FIFO")
    ax.legend()
    ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    out = FIGURES_DIR / "fifo_worker_utilization.png"
    fig.savefig(out, dpi=200)
    print(f"wrote {out}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Chapter 5 figures")
    parser.add_argument("--scheduler-csv", default="")
    parser.add_argument("--lifecycle-summary-csv", default="")
    parser.add_argument("--runtime-summary-csv", default="")
    parser.add_argument("--fifo-workers-csv", default="")
    args = parser.parse_args()

    ensure_dirs()
    if args.scheduler_csv:
        scheduler_chart(Path(args.scheduler_csv))
    if args.lifecycle_summary_csv:
        lifecycle_chart(Path(args.lifecycle_summary_csv))
    if args.runtime_summary_csv:
        runtime_chart(Path(args.runtime_summary_csv))
    if args.fifo_workers_csv:
        worker_utilization_chart(Path(args.fifo_workers_csv))


if __name__ == "__main__":
    main()
