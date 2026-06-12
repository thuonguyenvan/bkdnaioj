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

def burst_chart(path: Path) -> None:
    rows = read_csv(path)
    labels = [row["batch"] for row in rows]
    median = [as_float(row.get("queue_wait_median")) or 0 for row in rows]
    p95 = [as_float(row.get("queue_wait_p95")) or 0 for row in rows]
    throughput = [as_float(row.get("successful_submissions_per_min")) or 0 for row in rows]

    fig, left = plt.subplots(figsize=(9, 4.8))
    x = range(len(labels))
    left.bar([i - 0.18 for i in x], median, width=0.36, label="Median queue wait")
    left.bar([i + 0.18 for i in x], p95, width=0.36, label="P95 queue wait")
    left.set_ylabel("Queue wait (seconds)")
    left.set_xticks(list(x), labels)
    left.set_xlabel("Burst size (submissions)")
    left.grid(axis="y", alpha=0.25)

    right = left.twinx()
    right.plot(list(x), throughput, color="black", marker="o", label="Successful throughput")
    right.set_ylabel("Successful submissions/min")
    handles, names = left.get_legend_handles_labels()
    handles2, names2 = right.get_legend_handles_labels()
    left.legend(handles + handles2, names + names2, loc="upper left")
    left.set_title("Capability-aware FIFO under burst workloads")
    fig.tight_layout()
    out = FIGURES_DIR / "fifo_burst_scaling.png"
    fig.savefig(out, dpi=200)
    print(f"wrote {out}")


def runtime_by_worker_chart(path: Path) -> None:
    rows = read_csv(path)
    labels = [row.get("worker_name") or row.get("display_name") or row.get("worker_id", "")[:8] for row in rows]
    med = [as_float(row.get("runtime_median") or row.get("actual_median")) or 0 for row in rows]
    p95 = [as_float(row.get("runtime_p95") or row.get("actual_p95")) or 0 for row in rows]

    fig, ax = plt.subplots(figsize=(9, 4.8))
    x = range(len(labels))
    ax.bar([i - 0.18 for i in x], med, width=0.36, label="Median runtime")
    ax.bar([i + 0.18 for i in x], p95, width=0.36, label="P95 runtime")
    ax.set_xticks(list(x), labels, rotation=20, ha="right")
    ax.set_ylabel("Seconds")
    ax.set_title("Runtime by worker")
    ax.legend()
    ax.grid(axis="y", alpha=0.25)
    fig.tight_layout()
    out = FIGURES_DIR / "runtime_by_worker.png"
    fig.savefig(out, dpi=200)
    print(f"wrote {out}")


def simulation_chart(path: Path) -> None:
    rows = read_csv(path)
    selected = [row for row in rows if row.get("submissions") == "500"]
    if not selected:
        selected = rows
    groups: dict[str, list[dict]] = {}
    for row in selected:
        groups.setdefault(row["worker_count"], []).append(row)

    fig, ax = plt.subplots(figsize=(9, 4.8))
    for worker_count, items in sorted(groups.items(), key=lambda pair: int(pair[0])):
        items = sorted(items, key=lambda row: as_float(row.get("final_runtime_multiplier")) or 0)
        x = [as_float(row.get("final_runtime_multiplier")) or 0 for row in items]
        y = [as_float(row.get("queue_wait_p95")) or 0 for row in items]
        ax.plot(x, y, marker="o", label=f"{worker_count} workers")
    ax.set_xlabel("Final runtime multiplier")
    ax.set_ylabel("P95 queue wait (seconds)")
    ax.set_title("Simulated queue wait under heavier final workloads")
    ax.grid(axis="y", alpha=0.25)
    ax.legend()
    fig.tight_layout()
    out = FIGURES_DIR / "simulated_capacity.png"
    fig.savefig(out, dpi=200)
    print(f"wrote {out}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate Chapter 5 figures")
    parser.add_argument("--scheduler-csv", default="")
    parser.add_argument("--lifecycle-summary-csv", default="")
    parser.add_argument("--runtime-summary-csv", default="")
    parser.add_argument("--fifo-workers-csv", default="")
    parser.add_argument("--burst-csv", default="")
    parser.add_argument("--runtime-by-worker-csv", default="")
    parser.add_argument("--simulation-csv", default="")
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
    if args.burst_csv:
        burst_chart(Path(args.burst_csv))
    if args.runtime_by_worker_csv:
        runtime_by_worker_chart(Path(args.runtime_by_worker_csv))
    if args.simulation_csv:
        simulation_chart(Path(args.simulation_csv))


if __name__ == "__main__":
    main()
