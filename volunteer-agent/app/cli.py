"""olpai-volunteer CLI — volunteer judge worker management."""
from __future__ import annotations

import sys
import tempfile
import threading
import time
from pathlib import Path
import os
import shutil
import subprocess
import warnings

import typer

from . import config as cfg
from .capabilities import collect, get_resource_usage
from .client import APIClient
from .logging import configure_logging

app      = typer.Typer(help="OLPAI Volunteer Judge Agent", no_args_is_help=True)
svc_app  = typer.Typer(help="Manage system service")
app.add_typer(svc_app, name="service")


# ── helpers ──────────────────────────────────────────────────────────────────

def _echo(msg: str = "") -> None:
    typer.echo(msg)

def _ok(msg: str) -> None:
    typer.echo(typer.style("✓ ", fg=typer.colors.GREEN) + msg)

def _warn(msg: str) -> None:
    typer.echo(typer.style("! ", fg=typer.colors.YELLOW) + msg)

def _err(msg: str) -> None:
    typer.echo(typer.style("✗ ", fg=typer.colors.RED) + msg, err=True)

def _ask(prompt: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    val = input(f"{prompt}{suffix}: ").strip()
    return val or default


def _docker_info() -> tuple[bool, str]:
    """Return whether Docker daemon is usable and the last docker-info error."""
    try:
        result = subprocess.run(["docker", "info"], capture_output=True, text=True, timeout=5)
    except FileNotFoundError:
        return False, "docker command not found"
    except Exception as exc:
        return False, str(exc)
    if result.returncode == 0:
        return True, ""
    return False, (result.stderr or result.stdout or "docker info failed").strip()


def _run_start_command(cmd: list[str], wait_seconds: float = 2.0) -> bool:
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=20)
    if result.returncode != 0:
        return False
    time.sleep(wait_seconds)
    ok, _ = _docker_info()
    return ok


def _tail_text(path: Path, max_chars: int = 3000) -> str:
    try:
        text = path.read_text(errors="replace").strip()
    except Exception:
        return ""
    if len(text) <= max_chars:
        return text
    return text[-max_chars:]


def _start_dockerd_process() -> tuple[bool, str]:
    log_path = Path(tempfile.gettempdir()) / f"olpai-dockerd-{os.getpid()}.log"
    with log_path.open("w") as log_file:
        proc = subprocess.Popen(
            ["dockerd"],
            stdout=log_file,
            stderr=subprocess.STDOUT,
        )

    for _ in range(10):
        time.sleep(1)
        ok, err = _docker_info()
        if ok:
            return True, ""
        if proc.poll() is not None:
            dockerd_log = _tail_text(log_path)
            return False, dockerd_log or err or "dockerd exited before Docker became ready"

    proc.terminate()
    try:
        proc.wait(timeout=3)
    except subprocess.TimeoutExpired:
        proc.kill()
    dockerd_log = _tail_text(log_path)
    _, err = _docker_info()
    return False, dockerd_log or err or "dockerd started but Docker did not become ready"


def _looks_like_container() -> bool:
    if Path("/.dockerenv").exists():
        return True
    try:
        cgroup = Path("/proc/1/cgroup").read_text(errors="ignore").lower()
    except Exception:
        return False
    return any(marker in cgroup for marker in ("docker", "kubepods", "containerd", "podman"))


def _docker_failure_hint(reason: str) -> str:
    lower = reason.lower()
    if _looks_like_container():
        return (
            "This process appears to run inside a container/workspace. For final-phase sandbox jobs, "
            "run the agent on the VPS host with Docker service enabled, or start this container with "
            "the host Docker socket mounted: -v /var/run/docker.sock:/var/run/docker.sock. "
            "Docker-in-Docker requires a privileged container."
        )
    if "permission denied" in lower:
        return "The current user cannot access Docker. Try: sudo usermod -aG docker $USER, then log out and back in."
    if "system has not been booted with systemd" in lower:
        return "systemd is unavailable here. Start Docker with service docker start, or run the agent on the VPS host."
    return "Try on VPS host: sudo systemctl enable --now docker"


def _start_docker_daemon() -> tuple[bool, str]:
    """Start Docker daemon on common Linux hosts without assuming one runtime."""
    ok, err = _docker_info()
    if ok:
        return True, ""

    attempts: list[tuple[str, list[str]]] = []
    if shutil.which("systemctl"):
        attempts.append(("systemctl", ["systemctl", "start", "docker"]))
    if os.geteuid() != 0 and shutil.which("sudo") and shutil.which("systemctl"):
        attempts.append(("sudo-systemctl", ["sudo", "-n", "systemctl", "start", "docker"]))
    if shutil.which("service"):
        attempts.append(("service", ["service", "docker", "start"]))
    if os.geteuid() != 0 and shutil.which("sudo") and shutil.which("service"):
        attempts.append(("sudo-service", ["sudo", "-n", "service", "docker", "start"]))
    if shutil.which("dockerd"):
        attempts.append(("dockerd", ["dockerd"]))

    errors = [err] if err else []
    for label, cmd in attempts:
        try:
            if label == "dockerd":
                ok, err = _start_dockerd_process()
            else:
                ok = _run_start_command(cmd)
                if not ok:
                    _, err = _docker_info()
            if ok:
                return True, ""
            if err:
                errors.append(f"{label}: {err}")
        except Exception as exc:
            errors.append(f"{label}: {exc}")

    return False, errors[-1] if errors else "Docker daemon is not running"


def _docker_status_label(caps: dict) -> str:
    if caps.get("docker_available"):
        return "daemon running"
    if shutil.which("docker"):
        return "installed, daemon not running"
    return "not installed"


def _ask_native_final_mode(caps: dict, current: bool) -> bool:
    if caps.get("docker_available") or not caps.get("gpu"):
        return current

    _echo()
    _warn("GPU is visible, but Docker sandbox is not available.")
    _echo("Final inference can still use this GPU by running natively in this trusted environment.")
    _echo("  1. Enable trusted native final inference (default)")
    _echo("  2. Output-only jobs only")
    choice = _ask("Choose worker mode", "1")
    enabled = choice.strip() != "2"
    if enabled:
        _warn(
            "Trusted native final inference is enabled. Final submissions will run directly "
            "in this environment and can use the visible GPU, but this is not a Docker sandbox."
        )
    return enabled


# ── setup ─────────────────────────────────────────────────────────────────────

@app.command()
def setup() -> None:
    """First-run wizard: collect hardware info, register with platform."""
    _echo("\n=== OLPAI Volunteer Judge Agent — Setup ===\n")

    s = cfg.load()

    # 1. API URL — fixed, no prompt
    s.api_url = "https://api.bkdnaioj.app"

    # 2. Worker name
    worker_name = _ask("Display name for this machine", s.worker_name)
    s.worker_name = worker_name

    # 3. Collect hardware FIRST (needed to recommend workers)
    _echo("\nCollecting hardware info...")
    caps = collect()
    _echo(f"  CPU : {caps.get('cpu_model','?')} — {caps.get('cpu_cores','?')} cores / {caps.get('cpu_threads','?')} threads")
    _echo(f"  RAM : {caps.get('ram_gb','?')} GB")
    _echo(f"  Disk: {caps.get('disk_free_gb','?')} GB free")
    gpu_list = caps.get("gpu", [])
    if gpu_list:
        for g in gpu_list:
            _echo(f"  GPU : {g['model']} ({g['vram_gb']} GB VRAM, CUDA={g['cuda']})")
    else:
        _echo("  GPU : none detected")
    _echo(f"  Docker: {_docker_status_label(caps)}")
    _echo(f"  Python: {caps.get('python_version','?').split()[0]}")

    # Docker install offer (needed for final phase inference sandbox)
    docker_binary = bool(shutil.which("docker"))
    if not caps.get("docker_available"):
        _echo()
        if docker_binary:
            # Binary exists but daemon not running — try to start it
            _warn("Docker installed but daemon not running. Attempting to start...")
            started, reason = _start_docker_daemon()
            caps["docker_available"] = started
            if not caps.get("docker_available"):
                _warn("Could not start Docker daemon automatically.")
                if reason:
                    _warn(f"Docker reason: {reason}")
                _warn("Final-phase sandbox jobs require Docker. This worker will handle output-only jobs until Docker is running.")
                _echo(f"  {_docker_failure_hint(reason)}")
            else:
                _ok("Docker daemon started successfully.")
            install_docker = False
        else:
            _warn("Docker not found. Docker is required to judge final-phase submissions.")
            install_docker = _ask("Install Docker now? (y/n)", "y").lower().startswith("y")
        if install_docker:
            _install_docker()
            # Re-check after install
            import importlib
            from . import capabilities as _caps_mod
            importlib.reload(_caps_mod)
            caps["docker_available"] = _caps_mod._check_docker()
            if caps.get("docker_available"):
                _ok("Docker installed successfully.")
            else:
                _warn("Docker install may need a terminal restart. Re-run: olpai-volunteer doctor")

    native_final_allowed = _ask_native_final_mode(caps, s.native_final_allowed)
    s.native_final_allowed = native_final_allowed
    caps["native_final_allowed"] = native_final_allowed

    # 4. Benchmark
    run_bench = _ask("\nRun quick benchmark? (y/n)", "y").lower().startswith("y")
    bench_results: dict = {}
    if run_bench:
        bench_results = _benchmark()

    # 5. Recommend parallel workers based on hardware
    _echo()
    ram_bytes = caps.get("available_ram_bytes", 0)
    cpu_cores = caps.get("cpu_cores", 1) or 1
    has_docker = caps.get("docker_available", False)
    can_run_final = has_docker or native_final_allowed

    # Use same heuristic values as EstimateJobDemand in Go scheduler
    RAM_PER_OUTPUT_JOB = 256 * 1024 * 1024    # 256 MB (from scheduler/profile.go)
    RAM_PER_FINAL_JOB  = 512 * 1024 * 1024    # 512 MB (from scheduler/profile.go)

    recommended_output = max(1, min(
        ram_bytes // RAM_PER_OUTPUT_JOB if ram_bytes else cpu_cores,
        cpu_cores,
        16,
    ))

    if can_run_final:
        recommended_final = max(1, min(
            ram_bytes // RAM_PER_FINAL_JOB if ram_bytes else 1,
            4,
        ))
        final_mode = "Docker" if has_docker else "trusted native GPU"
        _echo(f"Recommended parallel workers:")
        _echo(f"  Output-only jobs (public_test, private_test): {recommended_output}")
        _echo(f"  Inference jobs   (final phases, {final_mode}): {recommended_final}")
        _echo(f"  → Suggested: {recommended_output} (covers all job types)")
        suggested = recommended_output
    else:
        _echo(f"Recommended parallel workers (output-only, no Docker): {recommended_output}")
        suggested = recommended_output

    while True:
        try:
            raw = _ask(f"Number of parallel judge workers (1–32)", str(suggested))
            n = int(raw)
            if 1 <= n <= 32:
                s.max_workers = n
                break
            _warn("Please enter a number between 1 and 32.")
        except ValueError:
            _warn("Please enter a valid number.")

    # 6. Register
    _echo(f"\nRegistering with {s.api_url} (max_workers={s.max_workers})...")
    client = APIClient(s.api_url, "")
    try:
        result = client.register(s.worker_name, {**caps, "benchmark": bench_results},
                                 max_workers=s.max_workers)
    except Exception as e:
        _err(f"Registration failed: {e}")
        raise typer.Exit(1)

    worker_id = result.get("id", "?")
    _ok(f"Registered! Worker ID: {worker_id}")
    _echo(f"  Status : {result.get('status')}")

    # 6. Save config (no token yet)
    cfg.save(s)
    _ok(f"Config saved → {cfg.CONFIG_FILE}")

    # 7. Wait for admin approval and start immediately
    _echo("\n" + "─" * 50)
    _echo(f"Worker ID: {worker_id}")
    _echo("Ask admin to approve this ID at: https://www.bkdnaioj.app/admin/workers")
    _echo("─" * 50)
    _echo()

    while True:
        token = input("Paste token from admin (or press Enter to skip and start later): ").strip()
        if not token:
            _echo("\nTo start later, run:")
            _echo(f"  olpai-volunteer approve-token <TOKEN>")
            _echo(f"  olpai-volunteer start")
            break
        # Validate token looks reasonable (hex string)
        if len(token) >= 32 and all(c in "0123456789abcdef" for c in token.lower()):
            s.worker_token = token
            cfg.save(s)
            _ok("Token saved.")
            _echo()
            _echo("Starting worker... (Ctrl+C to stop)")
            _echo()
            start(workers=0)  # 0 = use max_workers from config
            break
        else:
            _warn("Token looks invalid. Try again or press Enter to skip.")


# ── approve-token ─────────────────────────────────────────────────────────────

@app.command("approve-token")
def approve_token(token: str = typer.Argument(..., help="Token from admin")) -> None:
    """Save worker token received from admin after approval."""
    s = cfg.load()
    s.worker_token = token.strip()
    cfg.save(s)
    _ok(f"Token saved to {cfg.CONFIG_FILE}")
    _echo("Run:  olpai-volunteer start")


# ── doctor ────────────────────────────────────────────────────────────────────

@app.command()
def doctor() -> None:
    """Check environment readiness."""
    _echo("\n=== Environment Check ===\n")
    ok = True

    # Python
    v = sys.version_info
    if v >= (3, 11):
        _ok(f"Python {v.major}.{v.minor}.{v.micro}")
    else:
        _err(f"Python {v.major}.{v.minor} — need ≥ 3.11")
        ok = False

    # Config
    if cfg.CONFIG_FILE.exists():
        _ok(f"Config file: {cfg.CONFIG_FILE}")
    else:
        _warn(f"Config file not found — run: olpai-volunteer setup")

    s = cfg.load()

    # Token
    if s.worker_token:
        _ok("Worker token: set")
    else:
        _warn("Worker token: not set — run: olpai-volunteer approve-token <TOKEN>")

    # API reachable
    try:
        import httpx
        r = httpx.get(f"{s.api_url}/healthz", timeout=5)
        if r.status_code == 200:
            _ok(f"API reachable: {s.api_url}")
        else:
            _warn(f"API returned {r.status_code}")
    except Exception as e:
        _err(f"API not reachable ({s.api_url}): {e}")
        ok = False

    # Docker
    docker_ok, docker_reason = _docker_info()
    if docker_ok:
        _ok("Docker: daemon running")
    elif shutil.which("docker"):
        _warn("Docker: installed but daemon not running")
        if docker_reason:
            _warn(f"Docker reason: {docker_reason}")
        _echo(f"  {_docker_failure_hint(docker_reason)}")
    else:
        _warn("Docker: not installed (needed for final inference phase)")

    # Required Python packages
    for pkg in ["httpx", "psutil", "structlog"]:
        try:
            __import__(pkg)
            _ok(f"Package {pkg}: installed")
        except ImportError:
            _err(f"Package {pkg}: missing — pip install {pkg}")
            ok = False

    # Optional: Pillow (needed for Sudoku-like problems)
    try:
        import PIL  # noqa: F401
        _ok("Pillow: installed (image tasks supported)")
    except ImportError:
        _warn("Pillow: not installed — pip install Pillow  (needed for image-based problems)")

    _echo()
    if ok:
        _ok("All required checks passed.")
    else:
        _err("Some checks failed. Fix issues above before starting.")
    _echo()


# ── benchmark ─────────────────────────────────────────────────────────────────

def _install_docker() -> None:
    """Install Docker Engine based on the current OS."""
    import platform, subprocess
    system = platform.system().lower()

    if system == "linux":
        _echo("\nInstalling Docker Engine (Linux)...")
        _echo("  Running: curl -fsSL https://get.docker.com | sh")
        try:
            result = subprocess.run(
                ["sh", "-c", "curl -fsSL https://get.docker.com | sh"],
                timeout=300,
            )
            if result.returncode == 0:
                import os, time
                # Add current user to docker group
                user = os.environ.get("USER") or os.environ.get("LOGNAME", "")
                if user:
                    subprocess.run(["usermod", "-aG", "docker", user], check=False)
                _ok("Docker Engine installed.")

                # Try starting dockerd directly (needed in containers where systemctl fails)
                daemon_running, _ = _docker_info()

                if not daemon_running:
                    _echo("  Starting Docker daemon...")
                    daemon_running, reason = _start_docker_daemon()

                if daemon_running:
                    _ok("Docker daemon is running.")
                else:
                    _warn("Docker installed but daemon not started.")
                    if reason:
                        _warn(f"Docker reason: {reason}")
                    _echo(f"  {_docker_failure_hint(reason)}")

            else:
                _err("Docker install script returned non-zero. Install manually: https://docs.docker.com/engine/install/")
        except subprocess.TimeoutExpired:
            _err("Install timed out. Try manually: https://docs.docker.com/engine/install/")
        except Exception as e:
            _err(f"Install failed: {e}")

    elif system == "darwin":
        _echo("\nOn macOS, Docker Desktop must be installed manually.")
        _echo("  Download: https://www.docker.com/products/docker-desktop/")
        _echo("  Or via Homebrew: brew install --cask docker")
        install_brew = _ask("Install via Homebrew? (y/n)", "n").lower().startswith("y")
        if install_brew:
            try:
                subprocess.run(["brew", "install", "--cask", "docker"], check=True, timeout=300)
                _ok("Docker Desktop installed via Homebrew. Please launch Docker Desktop to complete setup.")
            except FileNotFoundError:
                _err("Homebrew not found. Install from https://brew.sh/ first.")
            except Exception as e:
                _err(f"Homebrew install failed: {e}")
    else:
        _warn(f"Auto-install not supported on {system}. Install manually: https://docs.docker.com/engine/install/")


def _benchmark() -> dict:
    """Run local benchmarks, return throughput-based results (ops/sec, bytes/sec)."""
    import math, tempfile, os, zipfile, io, subprocess
    results: dict = {}

    # CPU: ops/sec via sqrt loop
    _echo("  CPU benchmark...")
    N = 500_000
    t = time.perf_counter()
    _ = sum(math.sqrt(i) for i in range(N))
    elapsed = time.perf_counter() - t
    results["cpu_ops_per_sec"] = int(N / elapsed)
    results["cpu_sqrt500k_ms"] = round(elapsed * 1000, 1)  # backward compat
    _echo(f"    CPU: {results['cpu_ops_per_sec']:,} ops/sec")

    # Memory bandwidth
    _echo("  Memory bandwidth...")
    try:
        import numpy as np
        arr = np.random.rand(10_000_000)  # 80 MB float64
        t = time.perf_counter()
        _ = arr.copy()
        elapsed = time.perf_counter() - t
        results["memory_bandwidth_bytes_per_sec"] = int(arr.nbytes / elapsed)
        _echo(f"    Memory: {results['memory_bandwidth_bytes_per_sec'] // 1024 // 1024} MB/s")
    except ImportError:
        results["memory_bandwidth_bytes_per_sec"] = 0
        _echo("    Memory: skipped (numpy not installed)")

    # Disk throughput
    _echo("  Disk benchmark...")
    data = b"x" * (10 * 1024 * 1024)  # 10 MB
    with tempfile.NamedTemporaryFile(delete=False) as f:
        fname = f.name
        t = time.perf_counter()
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
        elapsed = time.perf_counter() - t
        results["disk_write_bytes_per_sec"] = int(len(data) / elapsed)
    t = time.perf_counter()
    with open(fname, "rb") as f:
        _ = f.read()
    results["disk_read_bytes_per_sec"] = int(len(data) / (time.perf_counter() - t))
    os.unlink(fname)
    _echo(f"    Disk write: {results['disk_write_bytes_per_sec'] // 1024 // 1024} MB/s  "
          f"read: {results['disk_read_bytes_per_sec'] // 1024 // 1024} MB/s")

    # Unzip throughput (use random data — incompressible = realistic)
    _echo("  Unzip benchmark...")
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("data.bin", os.urandom(5 * 1024 * 1024))  # 5 MB random
    zip_bytes = zip_buf.getvalue()
    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as zf:
        zfname = zf.name
        zf.write(zip_bytes)
    t = time.perf_counter()
    with zipfile.ZipFile(zfname) as zf:
        zf.extractall(tempfile.mkdtemp())
    results["unzip_bytes_per_sec"] = int(len(zip_bytes) / (time.perf_counter() - t))
    os.unlink(zfname)
    _echo(f"    Unzip: {results['unzip_bytes_per_sec'] // 1024} KB/s")

    # Docker startup (2 runs, use 2nd — image cached)
    _echo("  Docker startup benchmark...")
    try:
        subprocess.run(["docker", "run", "--rm", "hello-world"],
                       capture_output=True, timeout=60)  # warm-up / pull
        t = time.perf_counter()
        r = subprocess.run(["docker", "run", "--rm", "hello-world"],
                           capture_output=True, timeout=30)
        results["docker_startup_seconds"] = round(time.perf_counter() - t, 2)
        results["sandbox_passed"] = r.returncode == 0
        _echo(f"    Docker startup: {results['docker_startup_seconds']}s  "
              f"sandbox_passed={results['sandbox_passed']}")
    except Exception as e:
        results["docker_startup_seconds"] = -1.0
        results["sandbox_passed"] = False
        _echo(f"    Docker: unavailable ({e})")

    # GPU benchmark (NVIDIA via NVML + torch CUDA)
    _echo("  GPU benchmark...")
    results["gpu_fp32_ops_per_sec"] = 0.0
    results["available_vram_bytes"] = 0
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("ignore", FutureWarning)
            import pynvml  # type: ignore
        pynvml.nvmlInit()
        n_gpu = pynvml.nvmlDeviceGetCount()
        if n_gpu > 0:
            h = pynvml.nvmlDeviceGetHandleByIndex(0)
            mem = pynvml.nvmlDeviceGetMemoryInfo(h)
            results["available_vram_bytes"] = int(mem.free)
            try:
                import torch
                if torch.cuda.is_available():
                    # Matmul benchmark: 2 * N^3 FP32 ops per call
                    N = 4096
                    a = torch.randn(N, N, device="cuda", dtype=torch.float32)
                    b = torch.randn(N, N, device="cuda", dtype=torch.float32)
                    torch.mm(a, b); torch.cuda.synchronize()  # warmup
                    REPS = 5
                    t_gpu = time.perf_counter()
                    for _ in range(REPS):
                        torch.mm(a, b)
                    torch.cuda.synchronize()
                    elapsed_gpu = time.perf_counter() - t_gpu
                    ops = 2 * (N ** 3) * REPS
                    results["gpu_fp32_ops_per_sec"] = ops / elapsed_gpu
                    _echo(f"    GPU FP32: {results['gpu_fp32_ops_per_sec']/1e12:.2f} TFLOPS  "
                          f"VRAM free: {mem.free//1024//1024} MB")
                else:
                    _echo(f"    GPU: detected (VRAM {mem.free//1024//1024} MB) — torch CUDA unavailable")
            except ImportError:
                _echo(f"    GPU: detected (VRAM {mem.free//1024//1024} MB) — install torch for FLOPS benchmark")
        else:
            _echo("    GPU: none detected")
    except Exception:
        _echo("    GPU: none (non-NVIDIA or NVML unavailable)")

    return results


@app.command()
def benchmark() -> None:
    """Run local performance benchmark and print results."""
    _echo("\n=== Performance Benchmark ===\n")
    results = _benchmark()
    _echo(f"\nResults:")
    _echo(f"  CPU  : {results['cpu_sqrt500k_ms']}ms for 500k sqrt()")
    _echo(f"  Disk : write {results['disk_write_10mb_ms']}ms / read {results['disk_read_10mb_ms']}ms (10MB)")
    _echo()


# ── status ────────────────────────────────────────────────────────────────────

@app.command()
def status() -> None:
    """Show current agent configuration and worker state."""
    s = cfg.load()
    _echo("\n=== Agent Status ===\n")
    _echo(f"  Config   : {cfg.CONFIG_FILE}")
    _echo(f"  API URL  : {s.api_url}")
    _echo(f"  Name     : {s.worker_name}")
    _echo(f"  Token    : {'set (' + s.worker_token[:8] + '...)' if s.worker_token else 'not set'}")
    _echo(f"  Final    : {'trusted native enabled' if s.native_final_allowed else 'Docker sandbox required'}")
    _echo(f"  Poll     : every {s.poll_interval_s}s")
    _echo(f"  Heartbeat: every {s.heartbeat_interval_s}s")

    if not s.worker_token:
        _echo()
        _warn("Not configured. Run: olpai-volunteer setup")
        return

    # Try to fetch live status from API
    try:
        import httpx
        r = httpx.get(
            f"{s.api_url}/healthz",
            headers={"X-Worker-Token": s.worker_token},
            timeout=5,
        )
        _echo(f"\n  API health: {'ok' if r.status_code == 200 else r.status_code}")
    except Exception as e:
        _warn(f"\n  API unreachable: {e}")
    _echo()


# ── logs ──────────────────────────────────────────────────────────────────────

@app.command()
def logs(
    lines: int = typer.Option(50, "--lines", "-n", help="Number of lines to show"),
    follow: bool = typer.Option(False, "--follow", "-f", help="Follow log output"),
) -> None:
    """Show agent logs (service mode only)."""
    import platform
    import subprocess
    system = platform.system()

    if system == "Darwin":
        log_file = Path.home() / ".olpai" / "agent" / "logs" / "stdout.log"
        if not log_file.exists():
            _warn("No log file found. Is the service running?")
            return
        cmd = ["tail", f"-{lines}", str(log_file)]
        if follow:
            cmd = ["tail", "-f", str(log_file)]
        subprocess.run(cmd)
    elif system == "Linux":
        cmd = ["journalctl", "--user", "-u", "olpai-volunteer", f"-n{lines}"]
        if follow:
            cmd.append("-f")
        subprocess.run(cmd)
    else:
        _warn("Log viewing not supported on this platform.")


# ── start ─────────────────────────────────────────────────────────────────────

@app.command()
def start(
    workers: int = typer.Option(0, "--workers", "-w",
                                help="Parallel workers (default: use value from setup)"),
) -> None:
    """Start the agent (foreground mode). Use --workers to override parallelism."""
    from .runner import PhaseRunner
    from .worker_judge import VolunteerJudgeWorker
    from .artifact_cache import ArtifactCache

    configure_logging()
    s = cfg.load()

    if not s.worker_token:
        _err("Worker token not set. Run: olpai-volunteer setup && olpai-volunteer approve-token <TOKEN>")
        raise typer.Exit(1)

    if s.native_final_allowed:
        os.environ["OLPAI_ALLOW_NATIVE_FINAL"] = "1"

    n_workers = workers if workers > 0 else getattr(s, "max_workers", 1)

    import structlog
    log = structlog.get_logger()
    log.info("volunteer_agent_starting", api_url=s.api_url, worker_name=s.worker_name,
             parallel_workers=n_workers, native_final_allowed=s.native_final_allowed)

    client      = APIClient(s.api_url, s.worker_token)
    cache       = ArtifactCache()
    td_root     = s.temp_dir or None
    stop_event  = threading.Event()

    # Shared heartbeat — one per agent, not per worker thread
    def heartbeat_loop() -> None:
        while not stop_event.is_set():
            try:
                cpu, ram = get_resource_usage()
                client.heartbeat(cpu, ram)
            except Exception as e:
                log.warning("heartbeat_failed", error=str(e))
            stop_event.wait(s.heartbeat_interval_s)

    threading.Thread(target=heartbeat_loop, daemon=True).start()

    def poll_loop(worker_idx: int) -> None:
        judge_worker = VolunteerJudgeWorker(PhaseRunner(), cache)
        log.info("worker_thread_started", idx=worker_idx)
        while not stop_event.is_set():
            try:
                job = client.next_job()
                if job is None:
                    stop_event.wait(s.poll_interval_s)
                    continue

                log.info("job_received", worker=worker_idx, submission_id=job.submission_id,
                         is_final=job.is_final, attempt_id=job.attempt_id)
                with tempfile.TemporaryDirectory(
                    prefix=f"olpai-vol-{job.submission_id[:8]}-",
                    dir=td_root,
                ) as td:
                    job_stop_event = threading.Event()

                    def job_heartbeat_loop() -> None:
                        while not job_stop_event.wait(30):
                            try:
                                client.job_heartbeat(job.submission_id, job.attempt_id)
                            except Exception as hb_exc:
                                log.warning(
                                    "job_heartbeat_failed",
                                    worker=worker_idx,
                                    submission_id=job.submission_id,
                                    error=str(hb_exc),
                                )

                    hb_thread = threading.Thread(target=job_heartbeat_loop, daemon=True)
                    hb_thread.start()
                    try:
                        result = judge_worker.run(job, td)
                        client.submit_result(job.submission_id, {
                            "attempt_id":    job.attempt_id,
                            "status":        "done",
                            "raw_score":     result["raw_score"],
                            "display_score": result["display_score"],
                            "payload":       result.get("payload"),
                        })
                        log.info("job_done", worker=worker_idx, submission_id=job.submission_id,
                                 score=result["raw_score"])
                    except Exception as exc:
                        err_msg = str(exc)[:4000]
                        log.error("job_failed", worker=worker_idx, submission_id=job.submission_id,
                                  error=err_msg)
                        try:
                            client.submit_result(job.submission_id,
                                                 {
                                                     "attempt_id": job.attempt_id,
                                                     "status": "failed",
                                                     "error_message": err_msg,
                                                 })
                        except Exception:
                            pass
                    finally:
                        job_stop_event.set()
            except Exception as exc:
                log.error("poll_error", worker=worker_idx, error=str(exc))
                stop_event.wait(s.poll_interval_s)

    # Spawn N worker threads
    threads = [
        threading.Thread(target=poll_loop, args=(i,), daemon=True)
        for i in range(n_workers)
    ]
    for t in threads:
        t.start()

    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        log.info("shutting_down")
        stop_event.set()


# ── cache ─────────────────────────────────────────────────────────────────────

@app.command()
def cache(
    clear: bool = typer.Option(False, "--clear", help="Remove all cached artifacts"),
) -> None:
    """Show or clear local artifact cache (judge.py, inputs, ground_truth)."""
    from .artifact_cache import ArtifactCache, DEFAULT_CACHE_DIR
    c = ArtifactCache()
    if clear:
        n = c.clear()
        _ok(f"Cleared {n} cached files from {DEFAULT_CACHE_DIR}")
    else:
        _echo(f"\nCache location : {DEFAULT_CACHE_DIR}")
        _echo(f"Cache size     : {c.size_mb()} MB")
        _echo("\nCached files:")
        for f in sorted(DEFAULT_CACHE_DIR.iterdir()):
            if f.is_file():
                size_mb = round(f.stat().st_size / 1024 / 1024, 1)
                _echo(f"  {f.name:<60} {size_mb:>6} MB")
        _echo()


# ── service subcommands ───────────────────────────────────────────────────────

@svc_app.command("install")
def service_install() -> None:
    """Install as system service (auto-start on login)."""
    from . import service
    try:
        service.install()
        _ok("Service installed and started.")
    except Exception as e:
        _err(f"Failed: {e}")
        raise typer.Exit(1)


@svc_app.command("uninstall")
def service_uninstall() -> None:
    """Remove system service."""
    from . import service
    try:
        service.uninstall()
    except Exception as e:
        _err(f"Failed: {e}")
        raise typer.Exit(1)


@svc_app.command("start")
def service_start() -> None:
    """Start the service."""
    from . import service
    try:
        service.start()
        _ok("Service started.")
    except Exception as e:
        _err(f"Failed: {e}")
        raise typer.Exit(1)


@svc_app.command("stop")
def service_stop() -> None:
    """Stop the service."""
    from . import service
    try:
        service.stop()
        _ok("Service stopped.")
    except Exception as e:
        _err(f"Failed: {e}")
        raise typer.Exit(1)
