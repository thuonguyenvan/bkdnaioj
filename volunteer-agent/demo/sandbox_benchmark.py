"""
Sandbox benchmark — đo overhead và threat containment.

Usage:
    python demo/sandbox_benchmark.py

Requires: Docker running, docker-py installed (pip install docker)

Đo: wall-clock latency p50/p95 cho benign workload (bare vs sandbox)
    threat containment (fork_bomb, mem_bomb, infinite_loop)
"""
from __future__ import annotations

import statistics
import subprocess
import sys
import time
from pathlib import Path

SCRIPTS_DIR = Path(__file__).parent / "scripts"
TIMEOUT_S = 10
RUNS = 10  # number of runs for p50/p95

WORKLOADS = {
    "benign":     SCRIPTS_DIR / "benign_sklearn.py",
    "fork_bomb":  SCRIPTS_DIR / "fork_bomb.py",
    "mem_bomb":   SCRIPTS_DIR / "mem_bomb.py",
    "inf_loop":   SCRIPTS_DIR / "infinite_loop.py",
}


def run_bare(script: Path, timeout: int) -> tuple[float, bool]:
    """Run script as bare subprocess. Returns (elapsed, success)."""
    t = time.perf_counter()
    try:
        subprocess.run(
            [sys.executable, str(script)],
            capture_output=True,
            timeout=timeout,
        )
        return time.perf_counter() - t, True
    except subprocess.TimeoutExpired:
        return timeout, False
    except Exception:
        return time.perf_counter() - t, False


def run_sandbox(script: Path, timeout: int) -> tuple[float, bool]:
    """Run script inside Docker sandbox with resource limits."""
    import docker
    client = docker.from_env()
    image = "python:3.11-slim"

    t = time.perf_counter()
    try:
        container = client.containers.create(
            image=image,
            command=["/usr/local/bin/python", str(script)],
            network_mode="none",
            mem_limit="256m",
            nano_cpus=1_000_000_000,
            pids_limit=64,
            volumes={str(SCRIPTS_DIR): {"bind": str(SCRIPTS_DIR), "mode": "ro"}},
        )
        container.start()
        try:
            result = container.wait(timeout=timeout)
            success = result.get("StatusCode", 1) == 0
        except Exception:
            success = False
            try:
                container.kill()
            except Exception:
                pass
        finally:
            try:
                container.remove(force=True)
            except Exception:
                pass
        return time.perf_counter() - t, success
    except Exception as e:
        return time.perf_counter() - t, False


def p50(data: list[float]) -> float:
    return statistics.median(data)


def p95(data: list[float]) -> float:
    data_sorted = sorted(data)
    idx = int(len(data_sorted) * 0.95)
    return data_sorted[min(idx, len(data_sorted) - 1)]


def main() -> None:
    print(f"\n{'='*60}")
    print(f"Sandbox Benchmark — timeout={TIMEOUT_S}s, runs={RUNS}")
    print(f"{'='*60}\n")

    print(f"{'Workload':<12} {'Mode':<8} {'p50 (s)':>8} {'p95 (s)':>8} {'Contained':>10}")
    print("-" * 55)

    for name, script in WORKLOADS.items():
        for mode, runner in [("bare", run_bare), ("sandbox", run_sandbox)]:
            times = []
            contained = True
            for _ in range(RUNS if name == "benign" else 3):
                elapsed, success = runner(script, TIMEOUT_S)
                times.append(elapsed)
                if name == "benign" and not success:
                    contained = False
                if name != "benign" and success:
                    contained = False  # threat should NOT succeed

            contained_str = "✓" if (
                (name == "benign" and contained) or
                (name != "benign" and not contained)
            ) else "✗"

            print(
                f"{name:<12} {mode:<8} {p50(times):>8.3f} {p95(times):>8.3f} {contained_str:>10}"
            )

    print(f"\n{'='*60}")
    print("overhead% = (sandbox_p50 - bare_p50) / bare_p50 * 100")
    print("Contained ✓ = benign succeeded / threat was killed")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
