from __future__ import annotations

import argparse
import csv
from datetime import datetime
from pathlib import Path

from common import RESULTS_DIR, percentile, write_csv, write_markdown_table


def read_lifecycle(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))

def parse_time(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def main() -> None:
    parser = argparse.ArgumentParser(description="Estimate contest capacity from lifecycle CSV")
    parser.add_argument("--lifecycle-csv", required=True)
    parser.add_argument("--window-minutes", type=float, default=0.0)
    parser.add_argument("--target-p95-wait-s", type=float, default=120.0)
    parser.add_argument("--target-success-rate", type=float, default=0.99)
    args = parser.parse_args()

    rows = read_lifecycle(Path(args.lifecycle_csv))
    terminal = [r for r in rows if r.get("status") in {"done", "failed"}]
    successful = [r for r in rows if r.get("status") == "done"]
    waits = [float(r["queue_wait_seconds"]) for r in terminal if r.get("queue_wait_seconds")]
    e2e = [float(r["end_to_end_seconds"]) for r in terminal if r.get("end_to_end_seconds")]
    if not terminal:
        raise RuntimeError("no completed lifecycle rows")

    window_minutes = args.window_minutes
    if window_minutes <= 0:
        starts = [parse_time(r.get("claimed_at")) for r in terminal]
        ends = [parse_time(r.get("result_received_at")) for r in terminal]
        starts = [value for value in starts if value is not None]
        ends = [value for value in ends if value is not None]
        if not starts or not ends:
            raise RuntimeError("lifecycle CSV needs claimed_at/result_received_at or --window-minutes")
        window_minutes = (max(ends) - min(starts)).total_seconds() / 60

    terminal_throughput = len(terminal) / window_minutes
    successful_throughput = len(successful) / window_minutes
    success_rate = len(successful) / len(terminal)
    p95_wait = percentile(waits, 0.95)
    p95_e2e = percentile(e2e, 0.95)
    quality = (
        "pass"
        if p95_wait is not None
        and p95_wait <= args.target_p95_wait_s
        and success_rate >= args.target_success_rate
        else "limited"
    )

    rows_out = []
    for submissions_per_team_per_10m in [1, 2, 4]:
        per_team_per_min = submissions_per_team_per_10m / 10.0
        rows_out.append({
            "assumption": f"{submissions_per_team_per_10m} submissions/team/10min",
            "observed_window_minutes": window_minutes,
            "terminal_submissions_per_min": terminal_throughput,
            "successful_submissions_per_min": successful_throughput,
            "success_rate": success_rate,
            "estimated_concurrent_teams": int(successful_throughput / per_team_per_min),
            "p95_queue_wait_seconds": p95_wait,
            "p95_end_to_end_seconds": p95_e2e,
            "quality": quality,
        })

    out_csv = RESULTS_DIR / "capacity_estimation.csv"
    out_md = RESULTS_DIR / "capacity_estimation.md"
    write_csv(out_csv, rows_out)
    write_markdown_table(out_md, rows_out, "Capacity Estimation")
    print(f"wrote {out_csv}")
    print(f"wrote {out_md}")


if __name__ == "__main__":
    main()
