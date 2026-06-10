from __future__ import annotations

import argparse
import csv
from pathlib import Path

from common import RESULTS_DIR, percentile, write_csv, write_markdown_table


def read_lifecycle(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def main() -> None:
    parser = argparse.ArgumentParser(description="Estimate contest capacity from lifecycle CSV")
    parser.add_argument("--lifecycle-csv", required=True)
    parser.add_argument("--window-minutes", type=float, default=10.0)
    parser.add_argument("--target-p95-wait-s", type=float, default=120.0)
    args = parser.parse_args()

    rows = read_lifecycle(Path(args.lifecycle_csv))
    completed = [r for r in rows if r.get("status") in {"done", "failed"}]
    waits = [float(r["queue_wait_seconds"]) for r in completed if r.get("queue_wait_seconds")]
    e2e = [float(r["end_to_end_seconds"]) for r in completed if r.get("end_to_end_seconds")]
    if not completed:
        raise RuntimeError("no completed lifecycle rows")

    throughput_per_min = len(completed) / args.window_minutes
    p95_wait = percentile(waits, 0.95)
    p95_e2e = percentile(e2e, 0.95)
    quality = "pass" if p95_wait is not None and p95_wait <= args.target_p95_wait_s else "limited"

    rows_out = []
    for submissions_per_team_per_10m in [1, 2, 4]:
        per_team_per_min = submissions_per_team_per_10m / 10.0
        rows_out.append({
            "assumption": f"{submissions_per_team_per_10m} submissions/team/10min",
            "sustainable_submissions_per_min": throughput_per_min,
            "estimated_concurrent_teams": int(throughput_per_min / per_team_per_min),
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
