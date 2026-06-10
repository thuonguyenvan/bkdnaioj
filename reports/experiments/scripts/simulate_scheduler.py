from __future__ import annotations

import argparse
import csv
import random
from collections import defaultdict
from pathlib import Path

from common import RESULTS_DIR, percentile, write_csv, write_markdown_table


def read_runtime(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def median(values: list[float]) -> float:
    value = percentile(values, 0.5)
    if value is None:
        raise RuntimeError("empty median")
    return value


def build_runtime_matrix(rows: list[dict]) -> dict[tuple[str, str, str], float]:
    samples: dict[tuple[str, str, str], list[float]] = defaultdict(list)
    for row in rows:
        worker = row.get("worker_id")
        phase = row.get("phase_key")
        is_final = str(row.get("is_final")).lower()
        actual = row.get("actual_runtime_seconds")
        if not worker or not phase or not actual:
            continue
        try:
            samples[(worker, phase, is_final)].append(float(actual))
        except ValueError:
            continue
    return {key: median(vals) for key, vals in samples.items() if vals}


def build_jobs(rows: list[dict], limit: int | None, arrival_gap_s: float) -> list[dict]:
    jobs = []
    for idx, row in enumerate(rows[:limit] if limit else rows):
        jobs.append({
            "id": row.get("submission_id") or f"job-{idx}",
            "phase_key": row.get("phase_key"),
            "is_final": str(row.get("is_final")).lower(),
            "arrival": idx * arrival_gap_s,
            "measured_worker": row.get("worker_id"),
        })
    return jobs


def runtime_for(matrix: dict, worker: str, job: dict) -> float | None:
    return matrix.get((worker, job["phase_key"], job["is_final"]))


def simulate(strategy: str, jobs: list[dict], workers: list[str], matrix: dict, seed: int) -> dict:
    rng = random.Random(seed)
    available = {worker: 0.0 for worker in workers}
    waits = []
    finishes = []
    timeouts = 0
    gpu_runtime = 0.0
    total_runtime = 0.0

    for job in jobs:
        feasible = [(w, runtime_for(matrix, w, job)) for w in workers]
        feasible = [(w, rt) for w, rt in feasible if rt is not None]
        if not feasible:
            timeouts += 1
            continue

        if strategy == "fifo":
            worker, runtime = min(feasible, key=lambda x: available[x[0]])
        elif strategy == "random":
            worker, runtime = rng.choice(feasible)
        elif strategy == "capability":
            idle_or_soon = sorted(feasible, key=lambda x: (available[x[0]], x[1]))
            worker, runtime = idle_or_soon[0]
        elif strategy == "measurement_driven":
            worker, runtime = min(feasible, key=lambda x: max(job["arrival"], available[x[0]]) + x[1])
        else:
            raise RuntimeError(f"unknown strategy: {strategy}")

        start = max(job["arrival"], available[worker])
        finish = start + runtime
        wait = start - job["arrival"]
        available[worker] = finish
        waits.append(wait)
        finishes.append(finish)
        total_runtime += runtime
        if "gpu" in worker.lower() or "rtx" in worker.lower():
            gpu_runtime += runtime

    return {
        "strategy": strategy,
        "jobs": len(jobs),
        "scheduled": len(waits),
        "median_wait": percentile(waits, 0.5),
        "p95_wait": percentile(waits, 0.95),
        "makespan": max(finishes) if finishes else None,
        "timeout_rate": timeouts / len(jobs) if jobs else 0,
        "gpu_runtime_ratio": gpu_runtime / total_runtime if total_runtime else 0,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Replay scheduler baselines from measured runtime logs")
    parser.add_argument("--runtime-csv", required=True, help="CSV from collect_metrics runtime output")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument("--arrival-gap-s", type=float, default=2.0)
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    rows = read_runtime(Path(args.runtime_csv))
    matrix = build_runtime_matrix(rows)
    workers = sorted({key[0] for key in matrix})
    jobs = build_jobs(rows, args.limit or None, args.arrival_gap_s)
    strategies = ["fifo", "random", "capability", "measurement_driven"]
    results = [simulate(strategy, jobs, workers, matrix, args.seed) for strategy in strategies]

    out_csv = RESULTS_DIR / "scheduler_simulation.csv"
    out_md = RESULTS_DIR / "scheduler_simulation.md"
    write_csv(out_csv, results)
    write_markdown_table(out_md, results, "Scheduler Strategy Comparison")
    print(f"wrote {out_csv}")
    print(f"wrote {out_md}")


if __name__ == "__main__":
    main()
