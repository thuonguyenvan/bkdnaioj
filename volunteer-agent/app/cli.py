"""olpai-volunteer CLI — volunteer judge worker management."""
from __future__ import annotations

import sys
import tempfile
import threading
import time
from pathlib import Path

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


# ── setup ─────────────────────────────────────────────────────────────────────

@app.command()
def setup() -> None:
    """First-run wizard: collect hardware info, register with platform."""
    _echo("\n=== OLPAI Volunteer Judge Agent — Setup ===\n")

    s = cfg.load()

    # 1. API URL
    api_url = _ask("Platform URL", s.api_url)
    s.api_url = api_url.rstrip("/")

    # 2. Worker name
    worker_name = _ask("Display name for this machine", s.worker_name)
    s.worker_name = worker_name

    # 3. Collect hardware
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
    _echo(f"  Docker: {'yes' if caps.get('docker_available') else 'no'}")
    _echo(f"  Python: {caps.get('python_version','?').split()[0]}")

    # 4. Benchmark
    run_bench = _ask("\nRun quick benchmark? (y/n)", "y").lower().startswith("y")
    bench_results: dict = {}
    if run_bench:
        bench_results = _benchmark()

    # 5. Register
    _echo(f"\nRegistering with {s.api_url}...")
    client = APIClient(s.api_url, "")
    try:
        result = client.register(s.worker_name, {**caps, "benchmark": bench_results})
    except Exception as e:
        _err(f"Registration failed: {e}")
        raise typer.Exit(1)

    worker_id = result.get("id", "?")
    _ok(f"Registered! Worker ID: {worker_id}")
    _echo(f"  Status : {result.get('status')}")

    # 6. Save config (no token yet)
    cfg.save(s)
    _ok(f"Config saved → {cfg.CONFIG_FILE}")

    _echo("\n" + "─" * 50)
    _echo("Next steps:")
    _echo(f"  1. Ask admin to approve Worker ID: {worker_id}")
    _echo("  2. Admin goes to /admin/workers → Approve → copies token")
    _echo("  3. Run:  olpai-volunteer approve-token <TOKEN>")
    _echo("  4. Run:  olpai-volunteer start")
    _echo("─" * 50 + "\n")


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
    import shutil
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
    if shutil.which("docker"):
        try:
            import subprocess
            res = subprocess.run(["docker", "info"], capture_output=True, timeout=5)
            if res.returncode == 0:
                _ok("Docker: available")
            else:
                _warn("Docker: installed but not running")
        except Exception:
            _warn("Docker: not running")
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

def _benchmark() -> dict:
    """Run lightweight local benchmarks, return results dict."""
    import math
    _echo("  CPU benchmark...")
    t = time.perf_counter()
    _ = sum(math.sqrt(i) for i in range(500_000))
    cpu_ms = round((time.perf_counter() - t) * 1000, 1)
    _echo(f"    CPU score: {cpu_ms}ms (lower = faster)")

    _echo("  Disk benchmark...")
    import tempfile, os
    with tempfile.NamedTemporaryFile(delete=False) as f:
        fname = f.name
        data = b"x" * (10 * 1024 * 1024)  # 10MB
        t = time.perf_counter()
        f.write(data)
        f.flush()
        write_ms = round((time.perf_counter() - t) * 1000, 1)
    t = time.perf_counter()
    with open(fname, "rb") as f:
        _ = f.read()
    read_ms = round((time.perf_counter() - t) * 1000, 1)
    os.unlink(fname)
    _echo(f"    Disk write: {write_ms}ms  read: {read_ms}ms (10MB)")

    return {"cpu_sqrt500k_ms": cpu_ms, "disk_write_10mb_ms": write_ms, "disk_read_10mb_ms": read_ms}


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
def start() -> None:
    """Start the agent (foreground mode)."""
    from .runner import PhaseRunner
    from .worker_judge import VolunteerJudgeWorker

    configure_logging()
    s = cfg.load()

    if not s.worker_token:
        _err("Worker token not set. Run: olpai-volunteer setup && olpai-volunteer approve-token <TOKEN>")
        raise typer.Exit(1)

    import structlog
    log = structlog.get_logger()
    log.info("volunteer_agent_starting", api_url=s.api_url, worker_name=s.worker_name)

    client = APIClient(s.api_url, s.worker_token)
    judge_worker = VolunteerJudgeWorker(PhaseRunner())

    def heartbeat_loop() -> None:
        while True:
            try:
                cpu, ram = get_resource_usage()
                client.heartbeat(cpu, ram)
            except Exception as e:
                log.warning("heartbeat_failed", error=str(e))
            time.sleep(s.heartbeat_interval_s)

    threading.Thread(target=heartbeat_loop, daemon=True).start()

    while True:
        try:
            job = client.next_job()
            if job is None:
                time.sleep(s.poll_interval_s)
                continue

            log.info("job_received", submission_id=job.submission_id, is_final=job.is_final)
            td_root = s.temp_dir or None
            with tempfile.TemporaryDirectory(
                prefix=f"olpai-vol-{job.submission_id[:8]}-",
                dir=td_root,
            ) as td:
                try:
                    result = judge_worker.run(job, td)
                    client.submit_result(job.submission_id, {
                        "status":        "done",
                        "raw_score":     result["raw_score"],
                        "display_score": result["display_score"],
                        "payload":       result.get("payload"),
                    })
                    log.info("job_done", submission_id=job.submission_id, score=result["raw_score"])
                except Exception as exc:
                    err_msg = str(exc)[:4000]
                    log.error("job_failed", submission_id=job.submission_id, error=err_msg)
                    try:
                        client.submit_result(job.submission_id, {"status": "failed", "error_message": err_msg})
                    except Exception:
                        pass

        except KeyboardInterrupt:
            log.info("shutting_down")
            break
        except Exception as exc:
            log.error("poll_error", error=str(exc))
            time.sleep(s.poll_interval_s)


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
