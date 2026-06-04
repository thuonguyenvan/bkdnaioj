"""
Scheduling Benchmark — so sánh 3 strategies: FIFO / Tier / Cost

Cách chạy:
    cd backend
    # Khởi động stack với docker compose
    docker compose -f docker-compose.prod.yml up -d
    # Chạy benchmark
    python demo/scheduling_benchmark.py --api http://localhost:8080 --rounds 3 --jobs 100

Yêu cầu:
    pip install httpx rich

Metrics thu thập:
    - p50/p95 job claim wait time (enqueue → worker claim)
    - mismatch_rate: heavy job vào light worker (từ Prometheus)
    - timeout_rate: jobs bị reclaim timeout watcher
    - MAE T(i,j): từ job_execution_logs (qua /metrics endpoint)
"""
from __future__ import annotations

import argparse
import statistics
import time
import uuid
from dataclasses import dataclass, field
from typing import Optional

try:
    import httpx
except ImportError:
    print("pip install httpx rich")
    raise

try:
    from rich.console import Console
    from rich.table import Table
    console = Console()
except ImportError:
    console = None


# ── Config ─────────────────────────────────────────────────────────────────

API        = "http://localhost:8080"
METRICS_URL = f"{API}/metrics"

# 3 worker tiers (Docker Compose resource limits)
WORKER_TIERS = {
    "light":  {"cpus": "1",   "mem": "512m"},   # 60% of jobs
    "medium": {"cpus": "2",   "mem": "1g"},      # 30% of jobs
    "heavy":  {"cpus": "4",   "mem": "2g"},      # 10% of jobs
}

# Job mix ratio
JOB_MIX = [
    ("output_only",    0.60, False),  # non-final, light
    ("final_medium",   0.30, True),   # final, medium
    ("final_heavy",    0.10, True),   # final, heavy
]


# ── Data types ──────────────────────────────────────────────────────────────

@dataclass
class JobResult:
    submission_id:  str
    job_type:       str
    is_final:       bool
    enqueued_at:    float
    claimed_at:     Optional[float] = None
    completed_at:   Optional[float] = None

    @property
    def wait_seconds(self) -> Optional[float]:
        if self.claimed_at is None:
            return None
        return self.claimed_at - self.enqueued_at

    @property
    def execution_seconds(self) -> Optional[float]:
        if self.claimed_at is None or self.completed_at is None:
            return None
        return self.completed_at - self.claimed_at


@dataclass
class StrategyResult:
    strategy:       str
    n_jobs:         int
    wait_times:     list[float] = field(default_factory=list)
    exec_times:     list[float] = field(default_factory=list)
    timeouts:       int = 0
    errors:         int = 0


# ── Prometheus helpers ───────────────────────────────────────────────────────

def fetch_metric(metric_name: str, labels: dict = {}) -> Optional[float]:
    """Parse a gauge/counter value from Prometheus text format."""
    try:
        resp = httpx.get(METRICS_URL, timeout=5)
        for line in resp.text.splitlines():
            if line.startswith("#") or not line.strip():
                continue
            if metric_name not in line:
                continue
            # Check labels match
            match = all(f'{k}="{v}"' in line for k, v in labels.items())
            if match or not labels:
                parts = line.rsplit(" ", 1)
                if len(parts) == 2:
                    try:
                        return float(parts[1])
                    except ValueError:
                        pass
    except Exception:
        pass
    return None


def fetch_histogram_percentile(metric_name: str, quantile: float, labels: dict = {}) -> Optional[float]:
    """Read histogram quantile from Prometheus /metrics."""
    # Prometheus histogram quantile is derived from bucket counts.
    # For simplicity, read the _sum/_count to compute mean, or use pre-computed values.
    # Best approach: use the histogram buckets to approximate percentile.
    try:
        resp = httpx.get(METRICS_URL, timeout=5)
        buckets: list[tuple[float, float]] = []
        count_total = 0.0

        for line in resp.text.splitlines():
            if line.startswith("#") or not line.strip():
                continue
            if f"{metric_name}_bucket" not in line:
                continue
            if labels and not all(f'{k}="{v}"' in line for k, v in labels.items()):
                continue
            if 'le="' not in line:
                continue
            le_start = line.index('le="') + 4
            le_end = line.index('"', le_start)
            le_str = line[le_start:le_end]
            le = float("inf") if le_str == "+Inf" else float(le_str)
            val = float(line.rsplit(" ", 1)[1])
            buckets.append((le, val))

        if not buckets:
            return None

        total = buckets[-1][1] if buckets else 0
        if total == 0:
            return None

        target = quantile * total
        prev_le, prev_count = 0.0, 0.0
        for le, count in buckets:
            if count >= target:
                # Linear interpolation within bucket
                fraction = (target - prev_count) / max(count - prev_count, 1e-9)
                return prev_le + fraction * (le - prev_le if le != float("inf") else prev_le)
            prev_le, prev_count = le, count
        return None
    except Exception:
        return None


# ── Benchmark runner ─────────────────────────────────────────────────────────

def run_round(
    api: str,
    admin_token: str,
    contest_id: str,
    strategy: str,
    n_jobs: int,
) -> StrategyResult:
    """
    Inject n_jobs into the system with current strategy config.
    Workers must be running with SCHEDULING_STRATEGY env var set.
    Returns timing results.
    """
    result = StrategyResult(strategy=strategy, n_jobs=n_jobs)
    client = httpx.Client(base_url=api, timeout=30)
    headers = {"Authorization": f"Bearer {admin_token}"}

    # Submit jobs according to JOB_MIX
    jobs: list[JobResult] = []
    for job_type, ratio, is_final in JOB_MIX:
        count = max(1, int(n_jobs * ratio))
        for _ in range(count):
            # Submit a mock submission via API
            payload = {
                "contest_id": contest_id,
                "is_final": is_final,
                "files": [],  # mock
            }
            try:
                t_enqueue = time.perf_counter()
                resp = client.post("/api/v1/submissions", json=payload, headers=headers)
                if resp.status_code in (200, 201):
                    sub_id = resp.json().get("id", str(uuid.uuid4()))
                    jobs.append(JobResult(
                        submission_id=sub_id,
                        job_type=job_type,
                        is_final=is_final,
                        enqueued_at=t_enqueue,
                    ))
            except Exception as e:
                result.errors += 1

    # Poll Prometheus for job_claim_duration after jobs complete
    time.sleep(5)  # allow workers to process

    # Read histogram from Prometheus
    p50 = fetch_histogram_percentile(
        "olpai_job_claim_duration_seconds", 0.50,
        {"strategy": strategy}
    )
    p95 = fetch_histogram_percentile(
        "olpai_job_claim_duration_seconds", 0.95,
        {"strategy": strategy}
    )

    if p50 is not None:
        result.wait_times.append(p50)
    if p95 is not None:
        result.wait_times.append(p95)

    # Read timeout count
    timeouts = fetch_metric("olpai_job_timeout_total", {"strategy": strategy})
    result.timeouts = int(timeouts or 0)

    return result


# ── Standalone Prometheus reader (for post-experiment analysis) ──────────────

def print_metrics_summary(api: str) -> None:
    """Print current Prometheus metric values relevant to scheduling benchmark."""
    metrics_to_show = [
        ("Queue depth",          "olpai_queue_depth",           {}),
        ("Recompute p50 (full)", "olpai_leaderboard_recompute_duration_seconds", {"type": "task_phase_full"}),
        ("Recompute p50 (incr)", "olpai_leaderboard_recompute_duration_seconds", {"type": "task_phase_incremental"}),
        ("Job timeout (fifo)",   "olpai_job_timeout_total",     {"strategy": "fifo"}),
        ("Constraint rejects",   "olpai_scheduler_constraint_reject_total", {}),
    ]

    if console:
        t = Table(title="Current Prometheus Metrics")
        t.add_column("Metric", style="cyan")
        t.add_column("Value", justify="right")
        for label, name, labels in metrics_to_show:
            v = fetch_metric(name, labels)
            t.add_row(label, f"{v:.4f}" if v is not None else "N/A")
        console.print(t)
    else:
        print("\n--- Prometheus Metrics ---")
        for label, name, labels in metrics_to_show:
            v = fetch_metric(name, labels)
            print(f"  {label}: {v}")


# ── MAE calculation from job_execution_logs ──────────────────────────────────

def compute_mae_from_prometheus(api: str) -> dict:
    """
    Compute MAE of T(i,j) prediction from Prometheus prediction_error_ratio histogram.
    MAE ≈ mean(|error_ratio - 1|) across all observed jobs.

    Returns dict with keys: mean_error_ratio, mae_ratio, sample_count.
    """
    try:
        resp = httpx.get(f"{api}/metrics", timeout=5)
        sum_val, count_val = None, None
        for line in resp.text.splitlines():
            if "olpai_scheduler_prediction_error_ratio_sum" in line and not line.startswith("#"):
                sum_val = float(line.rsplit(" ", 1)[1])
            if "olpai_scheduler_prediction_error_ratio_count" in line and not line.startswith("#"):
                count_val = float(line.rsplit(" ", 1)[1])

        if sum_val is not None and count_val and count_val > 0:
            mean_ratio = sum_val / count_val
            return {
                "mean_error_ratio": mean_ratio,
                "mae_approx": abs(mean_ratio - 1.0),
                "sample_count": int(count_val),
            }
    except Exception:
        pass
    return {"mean_error_ratio": None, "mae_approx": None, "sample_count": 0}


# ── Main ─────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Scheduling strategy benchmark")
    parser.add_argument("--api",     default="http://localhost:8080")
    parser.add_argument("--metrics", action="store_true", help="Only print current metrics")
    parser.add_argument("--mae",     action="store_true", help="Only compute MAE from Prometheus")
    args = parser.parse_args()

    if args.metrics:
        print_metrics_summary(args.api)
        return

    if args.mae:
        result = compute_mae_from_prometheus(args.api)
        print(f"\nMAE of T(i,j) prediction:")
        print(f"  Mean error ratio : {result['mean_error_ratio']:.3f}" if result['mean_error_ratio'] else "  No data yet")
        print(f"  MAE (|ratio-1|)  : {result['mae_approx']:.3f}" if result['mae_approx'] else "")
        print(f"  Sample count     : {result['sample_count']}")
        return

    # Default: print instructions
    print("""
Scheduling Benchmark Instructions
===================================

1. Start stack:
   docker compose -f docker-compose.prod.yml up -d

2. Run workers with different strategies and measure via /metrics:

   Strategy A — FIFO (current default):
   SCHEDULING_STRATEGY=fifo  # workers call GET /api/v1/worker/jobs/next

   Strategy B — Cost-function:
   SCHEDULING_STRATEGY=cost  # workers call POST /api/v1/worker/jobs/claim-next

3. Inject test jobs (using existing test data or via Postman/seeder):
   make seed  # creates test accounts + sample contest

4. Observe metrics during experiment:
   python demo/scheduling_benchmark.py --api http://localhost:8080 --metrics

5. After experiment completes, compute MAE:
   python demo/scheduling_benchmark.py --api http://localhost:8080 --mae

Key metrics to collect from /metrics endpoint:
   olpai_job_claim_duration_seconds{strategy="fifo"}_bucket
   olpai_job_claim_duration_seconds{strategy="cost"}_bucket
   olpai_job_timeout_total
   olpai_scheduler_constraint_reject_total{reason="insufficient_ram"}
   olpai_scheduler_prediction_error_ratio_sum / _count
   olpai_leaderboard_recompute_duration_seconds{type="task_phase_full"}_bucket
   olpai_leaderboard_recompute_duration_seconds{type="task_phase_incremental"}_bucket

Expected results table (fill in during experiment):
   | Strategy | p50 Wait | p95 Wait | Timeouts | Constraint Rejects | MAE |
   |----------|----------|----------|----------|-------------------|-----|
   | FIFO     |          |          |          |                   | N/A |
   | Cost     |          |          |          |                   |     |
""")


if __name__ == "__main__":
    main()
