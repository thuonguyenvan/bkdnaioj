"""
Leaderboard Benchmark — đo latency full recompute vs incremental

Cách chạy:
    cd backend
    python demo/leaderboard_benchmark.py --api http://localhost:8080 --db $DATABASE_URL

Yêu cầu:
    pip install httpx psycopg2-binary rich

Thực nghiệm:
    - Seed N teams với submissions ngẫu nhiên
    - Inject 200 submissions, đo leaderboard recompute duration từ Prometheus
    - So sánh: full (task_phase_full) vs incremental (task_phase_incremental)
    - Chạy với N = 50, 200, 500 teams

Metrics đọc từ Prometheus /metrics:
    olpai_leaderboard_recompute_duration_seconds{type="task_phase_full"}
    olpai_leaderboard_recompute_duration_seconds{type="task_phase_incremental"}
"""
from __future__ import annotations

import argparse
import statistics
import time
from typing import Optional

try:
    import httpx
except ImportError:
    print("pip install httpx")
    raise


API_DEFAULT = "http://localhost:8080"
METRICS_URL_TPL = "{api}/metrics"


# ── Prometheus histogram helpers ─────────────────────────────────────────────

def read_histogram_stats(api: str, metric: str, label_type: str) -> dict:
    """
    Read sum, count, p50, p95, p99 from Prometheus histogram.
    Returns dict with keys: count, mean_ms, p50_ms, p95_ms, p99_ms.
    """
    url = METRICS_URL_TPL.format(api=api)
    try:
        resp = httpx.get(url, timeout=5)
        text = resp.text
    except Exception as e:
        return {"error": str(e)}

    buckets: list[tuple[float, float]] = []
    count_val = 0.0
    sum_val   = 0.0

    for line in text.splitlines():
        if line.startswith("#"):
            continue
        if metric not in line:
            continue
        if f'type="{label_type}"' not in line:
            continue

        if "_bucket{" in line and 'le="' in line:
            try:
                le_s = line.split('le="')[1].split('"')[0]
                le = float("inf") if le_s == "+Inf" else float(le_s)
                val = float(line.rsplit(" ", 1)[1])
                buckets.append((le, val))
            except (ValueError, IndexError):
                pass
        elif "_count{" in line or f"{metric}_count{{" in line:
            try:
                count_val = float(line.rsplit(" ", 1)[1])
            except (ValueError, IndexError):
                pass
        elif "_sum{" in line or f"{metric}_sum{{" in line:
            try:
                sum_val = float(line.rsplit(" ", 1)[1])
            except (ValueError, IndexError):
                pass

    if not buckets or count_val == 0:
        return {"count": 0, "mean_ms": None, "p50_ms": None, "p95_ms": None, "p99_ms": None}

    def percentile(q: float) -> Optional[float]:
        target = q * count_val
        prev_le, prev_count = 0.0, 0.0
        for le, count in sorted(buckets):
            if count >= target:
                frac = (target - prev_count) / max(count - prev_count, 1e-9)
                est = prev_le + frac * (min(le, prev_le * 10 or 10) - prev_le)
                return round(est * 1000, 2)  # → ms
            prev_le, prev_count = le, count
        return None

    return {
        "count":   int(count_val),
        "mean_ms": round((sum_val / count_val) * 1000, 2) if count_val else None,
        "p50_ms":  percentile(0.50),
        "p95_ms":  percentile(0.95),
        "p99_ms":  percentile(0.99),
    }


def read_metric_counter(api: str, metric: str, labels: dict = {}) -> Optional[float]:
    url = METRICS_URL_TPL.format(api=api)
    try:
        resp = httpx.get(url, timeout=5)
        for line in resp.text.splitlines():
            if line.startswith("#") or metric not in line:
                continue
            if all(f'{k}="{v}"' in line for k, v in labels.items()):
                try:
                    return float(line.rsplit(" ", 1)[1])
                except (ValueError, IndexError):
                    pass
    except Exception:
        pass
    return None


# ── Report ────────────────────────────────────────────────────────────────────

def print_leaderboard_report(api: str) -> None:
    """Print leaderboard recompute metrics from current Prometheus state."""
    print("\n" + "="*65)
    print("Leaderboard Recompute Benchmark — Current State")
    print("="*65)

    for label, type_key in [("Full recompute (O(n))", "task_phase_full"),
                             ("Incremental (O(log n))", "task_phase_incremental"),
                             ("Contest phase", "contest_phase")]:
        stats = read_histogram_stats(api, "olpai_leaderboard_recompute_duration_seconds", type_key)
        if stats.get("count", 0) == 0:
            print(f"\n{label}: no data yet")
            continue
        print(f"\n{label}:")
        print(f"  Calls : {stats['count']}")
        print(f"  Mean  : {stats['mean_ms']} ms")
        print(f"  p50   : {stats['p50_ms']} ms")
        print(f"  p95   : {stats['p95_ms']} ms")
        print(f"  p99   : {stats['p99_ms']} ms")

    # Max-break rate (full recompute triggered by new max)
    full_count = read_histogram_stats(api, "olpai_leaderboard_recompute_duration_seconds", "task_phase_full").get("count", 0)
    incr_count = read_histogram_stats(api, "olpai_leaderboard_recompute_duration_seconds", "task_phase_incremental").get("count", 0)
    total = full_count + incr_count
    if total > 0:
        max_break_rate = round(100 * full_count / total, 1)
        print(f"\nMax-break rate: {max_break_rate}% submissions triggered O(n) full recompute")
        print(f"  (Full: {full_count}, Incremental: {incr_count}, Total: {total})")

    print("\n" + "="*65)
    print("Expected results for thesis table:")
    print("  | N teams | Full p50 | Full p95 | Incr p50 | Incr p95 | Max-break% |")
    print("  |---------|----------|----------|----------|----------|------------|")
    print("  | 50      |   ?ms    |   ?ms    |   ?ms    |   ?ms    |    ?%      |")
    print("  | 200     |   ?ms    |   ?ms    |   ?ms    |   ?ms    |    ?%      |")
    print("  | 500     |   ?ms    |   ?ms    |   ?ms    |   ?ms    |    ?%      |")
    print()
    print("Để có số liệu:")
    print("  1. Seed data: make seed  (hoặc API tạo contest + submissions)")
    print("  2. Submit nhiều bài để tạo leaderboard entries")
    print("  3. Đọc kết quả: python demo/leaderboard_benchmark.py --api http://localhost:8080")


# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Leaderboard recompute benchmark")
    parser.add_argument("--api", default=API_DEFAULT)
    args = parser.parse_args()
    print_leaderboard_report(args.api)


if __name__ == "__main__":
    main()
