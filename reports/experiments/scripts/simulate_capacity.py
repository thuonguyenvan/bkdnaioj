from __future__ import annotations

import argparse
import csv
import heapq
import json
from pathlib import Path

from common import RESULTS_DIR, percentile, write_csv, write_markdown_table


def read_csv(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def as_float(value: object, default: float = 0.0) -> float:
    try:
        if value in (None, ""):
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_capabilities(raw: str) -> dict:
    try:
        return json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return {}


def worker_profiles(workers_csv: Path, limit: int) -> list[dict]:
    profiles = []
    for row in read_csv(workers_csv):
        caps = parse_capabilities(row.get("capabilities", ""))
        max_workers = int(row.get("max_workers") or 1)
        output_slots = int(caps.get("max_output_slots") or max_workers)
        inference_slots = int(caps.get("max_inference_slots") or 0)
        profiles.append({
            "worker_id": row["id"],
            "worker_name": row.get("display_name") or row["id"],
            "max_workers": max_workers,
            "output_slots": output_slots,
            "inference_slots": inference_slots,
            "has_final": inference_slots > 0,
            "speed": 1.0,
        })
    active = [p for p in profiles if p["output_slots"] > 0 or p["inference_slots"] > 0]
    return active[:limit]


def runtime_samples(lifecycle_csv: Path, final_multiplier: float) -> tuple[list[float], list[float]]:
    rows = read_csv(lifecycle_csv)
    output = []
    final = []
    for row in rows:
        runtime = as_float(row.get("worker_runtime_seconds"))
        if runtime <= 0:
            continue
        if str(row.get("is_final")).lower() == "true":
            final.append(runtime * final_multiplier)
        else:
            output.append(runtime)
    if not output:
        output = [1.0]
    if not final:
        final = [max(output)]
    return output, final


def simulate(
    workers: list[dict],
    output_samples: list[float],
    final_samples: list[float],
    submissions: int,
    final_ratio: float,
) -> dict:
    output_slots: list[tuple[float, str]] = []
    inference_slots: list[tuple[float, str]] = []
    for worker in workers:
        for _ in range(worker["output_slots"]):
            output_slots.append((0.0, worker["worker_name"]))
        for _ in range(worker["inference_slots"]):
            inference_slots.append((0.0, worker["worker_name"]))
    heapq.heapify(output_slots)
    heapq.heapify(inference_slots)
    if not output_slots and not inference_slots:
        raise RuntimeError("no slots available for simulation")

    final_count = int(round(submissions * final_ratio))
    jobs = [True] * final_count + [False] * (submissions - final_count)
    waits = []
    final_waits = []
    finish_times = []
    worker_busy: dict[str, float] = {worker["worker_name"]: 0.0 for worker in workers}

    for idx, is_final in enumerate(jobs):
        arrival = 0.0
        if is_final and inference_slots:
            available, worker_name = heapq.heappop(inference_slots)
            runtime = final_samples[idx % len(final_samples)]
            finish = max(arrival, available) + runtime
            heapq.heappush(inference_slots, (finish, worker_name))
            final_waits.append(max(0.0, available - arrival))
        elif output_slots:
            available, worker_name = heapq.heappop(output_slots)
            runtime = output_samples[idx % len(output_samples)]
            finish = max(arrival, available) + runtime
            heapq.heappush(output_slots, (finish, worker_name))
        else:
            available, worker_name = heapq.heappop(inference_slots)
            runtime = final_samples[idx % len(final_samples)] if is_final else output_samples[idx % len(output_samples)]
            finish = max(arrival, available) + runtime
            heapq.heappush(inference_slots, (finish, worker_name))
        wait = max(0.0, available - arrival)
        waits.append(wait)
        finish_times.append(finish)
        worker_busy[worker_name] = worker_busy.get(worker_name, 0.0) + runtime

    makespan = max(finish_times) if finish_times else 0.0
    return {
        "makespan_seconds": makespan,
        "throughput_per_min": submissions * 60 / makespan if makespan else None,
        "queue_wait_median": percentile(waits, 0.5),
        "queue_wait_p95": percentile(waits, 0.95),
        "final_queue_wait_p95": percentile(final_waits, 0.95),
        "avg_worker_utilization": (
            sum(worker_busy.values()) / (makespan * len(workers)) if makespan and workers else None
        ),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Replay FIFO capacity under runtime/worker-count scenarios")
    parser.add_argument("--lifecycle-csv", required=True)
    parser.add_argument("--workers-csv", required=True)
    parser.add_argument("--worker-counts", default="4,5,6,8,10")
    parser.add_argument("--submissions", default="100,300,500,1000")
    parser.add_argument("--final-multipliers", default="1,2,5,10")
    parser.add_argument("--final-ratio", type=float, default=0.5)
    parser.add_argument("--prefix", default="capacity_simulation")
    args = parser.parse_args()

    rows = []
    for worker_count in [int(x) for x in args.worker_counts.split(",") if x]:
        workers = worker_profiles(Path(args.workers_csv), worker_count)
        for multiplier in [float(x) for x in args.final_multipliers.split(",") if x]:
            output_samples, final_samples = runtime_samples(Path(args.lifecycle_csv), multiplier)
            for n_submissions in [int(x) for x in args.submissions.split(",") if x]:
                result = simulate(workers, output_samples, final_samples, n_submissions, args.final_ratio)
                rows.append({
                    "worker_count": worker_count,
                    "submissions": n_submissions,
                    "final_runtime_multiplier": multiplier,
                    "final_ratio": args.final_ratio,
                    **result,
                    "teams_1_submit_per_10m": int((result["throughput_per_min"] or 0) / 0.1),
                    "teams_2_submit_per_10m": int((result["throughput_per_min"] or 0) / 0.2),
                    "teams_4_submit_per_10m": int((result["throughput_per_min"] or 0) / 0.4),
                })

    out_csv = RESULTS_DIR / f"{args.prefix}.csv"
    out_md = RESULTS_DIR / f"{args.prefix}.md"
    write_csv(out_csv, rows)
    write_markdown_table(out_md, rows, "Simulated Capacity")
    print(out_csv)


if __name__ == "__main__":
    main()
