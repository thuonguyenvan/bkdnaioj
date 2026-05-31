# Phase 03 — Volunteer Agent (Python)

**Status:** Pending | **Effort:** 8h | **Depends on:** Phase 02

## Overview

Python agent cài trên máy volunteer. Reuse toàn bộ logic judge từ `backend/workers/`. Thay vì subscribe Redis trực tiếp, agent poll API server qua HTTP. Agent tự collect hardware info khi khởi động lần đầu.

## Agent Location

**New directory:** `volunteer-agent/`

```
volunteer-agent/
├── app/
│   ├── __init__.py
│   ├── config.py          — env vars (API_URL, WORKER_TOKEN, WORKER_ID)
│   ├── main.py            — entrypoint + poll loop
│   ├── client.py          — HTTP client (API calls)
│   ├── capabilities.py    — hardware info collector
│   ├── runner.py          — reuse PhaseRunner (copy/symlink từ workers/)
│   ├── worker_judge.py    — adapted JudgeWorker (download từ URL thay MinIO)
│   └── storage.py         — download artifact từ presigned URL
├── pyproject.toml
├── Dockerfile
└── README.md
```

## Reuse Strategy

Từ `backend/workers/app/`:
- `runner.py` → copy nguyên (PhaseRunner không đổi)
- `worker_judge.py` → adapt: thay `self._store.download(storage_path, dest)` bằng download HTTP URL
- `logging.py` → copy nguyên

KHÔNG dùng:
- `queue.py` — thay bằng HTTP polling
- `db.py` — không cần DB access trực tiếp
- `config.py` — viết mới cho HTTP-based config
- `storage.py` — viết mới (download từ presigned URL, không cần MinIO credentials)

## Config

**File:** `volunteer-agent/app/config.py`

```python
import os
from dataclasses import dataclass

@dataclass
class Settings:
    api_url: str           = os.getenv("API_URL", "http://localhost:8080")
    worker_token: str      = os.getenv("WORKER_TOKEN", "")  # set sau khi approved
    poll_interval_s: int   = int(os.getenv("POLL_INTERVAL_S", "10"))
    heartbeat_interval_s: int = int(os.getenv("HEARTBEAT_INTERVAL_S", "30"))
    sandbox_timeout_s: int = int(os.getenv("SANDBOX_TIMEOUT_S", "600"))
    temp_dir: str | None   = os.getenv("TEMP_DIR")  # None = system default
    log_level: str         = os.getenv("LOG_LEVEL", "INFO")
```

## Capabilities Collector

**File:** `volunteer-agent/app/capabilities.py`

```python
import platform
import psutil
import subprocess
import sys

def collect() -> dict:
    cap = {
        "os": platform.system().lower(),
        "os_version": platform.version(),
        "cpu_model": platform.processor(),
        "cpu_cores": psutil.cpu_count(logical=False),
        "cpu_threads": psutil.cpu_count(logical=True),
        "ram_gb": round(psutil.virtual_memory().total / 1024**3, 1),
        "disk_free_gb": round(psutil.disk_usage("/").free / 1024**3, 1),
        "python_version": sys.version,
        "docker_available": _check_docker(),
        "gpu": _collect_gpu(),
    }
    return cap

def _check_docker() -> bool:
    try:
        result = subprocess.run(["docker", "info"], capture_output=True, timeout=5)
        return result.returncode == 0
    except Exception:
        return False

def _collect_gpu() -> list[dict]:
    try:
        import pynvml
        pynvml.nvmlInit()
        gpus = []
        for i in range(pynvml.nvmlDeviceGetCount()):
            h = pynvml.nvmlDeviceGetHandleByIndex(i)
            info = pynvml.nvmlDeviceGetMemoryInfo(h)
            gpus.append({
                "model": pynvml.nvmlDeviceGetName(h).decode(),
                "vram_gb": round(info.total / 1024**3, 1),
                "cuda": True,
            })
        return gpus
    except Exception:
        return []

def get_resource_usage() -> tuple[int, int]:
    cpu = int(psutil.cpu_percent(interval=1))
    ram = int(psutil.virtual_memory().percent)
    return cpu, ram
```

## HTTP Client

**File:** `volunteer-agent/app/client.py`

```python
import httpx
from dataclasses import dataclass

@dataclass
class Job:
    submission_id: str
    task_id: str
    phase_id: str
    is_final: bool
    judge_key: str
    context: dict
    artifacts: list[dict]  # [{type, key, original_filename, url}]
    timeout_secs: int

class APIClient:
    def __init__(self, api_url: str, token: str):
        self._base = api_url.rstrip("/")
        self._headers = {"X-Worker-Token": token}

    def register(self, display_name: str, capabilities: dict) -> dict:
        r = httpx.post(f"{self._base}/api/v1/worker/register",
                       json={"display_name": display_name, "capabilities": capabilities},
                       timeout=10)
        r.raise_for_status()
        return r.json()

    def heartbeat(self, cpu: int, ram: int) -> None:
        httpx.post(f"{self._base}/api/v1/worker/heartbeat",
                   json={"cpu_usage": cpu, "ram_usage": ram},
                   headers=self._headers, timeout=5)

    def next_job(self) -> Job | None:
        r = httpx.get(f"{self._base}/api/v1/worker/jobs/next",
                      headers=self._headers, timeout=15)
        r.raise_for_status()
        data = r.json()
        if not data.get("submission_id"):
            return None
        return Job(**data)

    def submit_result(self, submission_id: str, result: dict) -> None:
        httpx.post(f"{self._base}/api/v1/worker/jobs/{submission_id}/result",
                   json=result, headers=self._headers, timeout=10)
```

## Adapted Storage (download từ presigned URL)

**File:** `volunteer-agent/app/storage.py`

```python
import httpx
import os

def download_url(url: str, dest_path: str) -> str:
    os.makedirs(os.path.dirname(dest_path), exist_ok=True)
    with httpx.stream("GET", url, timeout=120) as r:
        r.raise_for_status()
        with open(dest_path, "wb") as f:
            for chunk in r.iter_bytes(chunk_size=1024*1024):
                f.write(chunk)
    return dest_path
```

## Adapted JudgeWorker

**File:** `volunteer-agent/app/worker_judge.py`

Thay `self._store.download(f.storage_path, dest)` bằng `storage.download_url(artifact_url, dest)`:

```python
class VolunteerJudgeWorker:
    def __init__(self, runner: PhaseRunner) -> None:
        self._runner = runner

    def run(self, job: Job, work_dir: str) -> dict:
        submission_dir = os.path.join(work_dir, "submission")
        assets_dir = os.path.join(work_dir, "assets")
        output_dir = os.path.join(work_dir, "output")
        os.makedirs(submission_dir, exist_ok=True)
        os.makedirs(assets_dir, exist_ok=True)

        asset_paths = {}
        for artifact in job.artifacts:
            if artifact["type"] == "submission":
                dest = safe_dest(submission_dir, artifact["original_filename"])
                storage.download_url(artifact["url"], dest)
            else:
                dest = safe_dest(assets_dir, artifact["original_filename"])
                storage.download_url(artifact["url"], dest)
                asset_paths[artifact["key"]] = dest
                asset_paths[artifact["original_filename"]] = dest
                # copy to asset_key filename
                key_dest = safe_dest(assets_dir, artifact["key"])
                if os.path.abspath(key_dest) != os.path.abspath(dest):
                    shutil.copyfile(dest, key_dest)

        # Write context.json
        context_path = os.path.join(work_dir, "context.json")
        with open(context_path, "w") as f:
            json.dump(job.context, f)

        judge = self._resolve_judge(job.judge_key, asset_paths, assets_dir)

        if job.is_final:
            # extract zip, run inference, then judge
            return self._runner.run_final(...)
        return self._runner.run_non_final(
            judge=judge,
            submission_dir=submission_dir,
            assets_dir=assets_dir,
            output_dir=output_dir,
            context_path=context_path,
        )

    def _resolve_judge(self, judge_key, asset_paths, assets_dir) -> str:
        # Same logic as official worker (only .py files)
        candidates = [judge_key, "judge.py", "judge_script"]
        for key in candidates:
            if not key:
                continue
            if key in asset_paths and asset_paths[key].endswith(".py"):
                return asset_paths[key]
            path = os.path.join(assets_dir, key)
            if os.path.isfile(path) and path.endswith(".py"):
                return path
        raise RuntimeError(f"missing judge entrypoint {judge_key or 'judge.py'}")
```

## Main Poll Loop

**File:** `volunteer-agent/app/main.py`

```python
import os, time, tempfile, threading
import structlog
from .config import Settings
from .client import APIClient
from .capabilities import collect, get_resource_usage
from .worker_judge import VolunteerJudgeWorker
from .runner import PhaseRunner

log = structlog.get_logger()

def main():
    s = Settings()
    client = APIClient(s.api_url, s.worker_token)
    judge_worker = VolunteerJudgeWorker(PhaseRunner())

    # First boot: if no token, register and exit with instructions
    if not s.worker_token:
        display_name = os.getenv("WORKER_NAME", os.uname().nodename)
        caps = collect()
        result = client.register(display_name, caps)
        print(f"Registered! ID: {result['id']}")
        print("Ask admin to approve your worker and provide the API token.")
        print("Then set WORKER_TOKEN=<token> and restart.")
        return

    log.info("volunteer_agent_starting", api_url=s.api_url)

    # Heartbeat thread
    def heartbeat_loop():
        while True:
            try:
                cpu, ram = get_resource_usage()
                client.heartbeat(cpu, ram)
            except Exception as e:
                log.warning("heartbeat_failed", error=str(e))
            time.sleep(s.heartbeat_interval_s)

    threading.Thread(target=heartbeat_loop, daemon=True).start()

    # Poll loop
    temp_dir = s.temp_dir or None
    while True:
        try:
            job = client.next_job()
            if job is None:
                time.sleep(s.poll_interval_s)
                continue

            log.info("job_received", submission_id=job.submission_id)
            with tempfile.TemporaryDirectory(prefix=f"olpai-vol-{job.submission_id}-", dir=temp_dir) as td:
                try:
                    result = judge_worker.run(job, td)
                    client.submit_result(job.submission_id, {
                        "status": "done",
                        "raw_score": result["raw_score"],
                        "display_score": result["display_score"],
                        "payload": result.get("payload"),
                    })
                    log.info("job_done", submission_id=job.submission_id, score=result["raw_score"])
                except Exception as e:
                    client.submit_result(job.submission_id, {
                        "status": "failed",
                        "error_message": str(e)[:4000],
                    })
                    log.error("job_failed", submission_id=job.submission_id, error=str(e))

        except KeyboardInterrupt:
            log.info("shutting_down")
            break
        except Exception as e:
            log.error("poll_error", error=str(e))
            time.sleep(s.poll_interval_s)
```

## Dependencies

**File:** `volunteer-agent/pyproject.toml`

```toml
[project]
name = "olpai-volunteer-agent"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
    "httpx>=0.27",
    "psutil>=5.9",
    "structlog>=24.0",
    "pynvml>=11.0",   # optional GPU detection
]

[project.optional-dependencies]
docker = ["docker>=7.0"]

[project.scripts]
olpai-volunteer = "app.main:main"
```

## Docker

**File:** `volunteer-agent/Dockerfile`

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY pyproject.toml .
RUN pip install -e ".[docker]"
COPY app/ ./app/
CMD ["olpai-volunteer"]
```

## Setup flow cho volunteer

```bash
# 1. Cài agent
pip install olpai-volunteer-agent
# hoặc docker

# 2. Lần đầu: đăng ký (không cần token)
WORKER_NAME="lab-rtx4090" API_URL="https://judge.bkdnaioj.com" olpai-volunteer
# → in ra: "Registered! ID: xxx, ask admin to approve"

# 3. Admin approve trên web → nhận token

# 4. Chạy thực sự
WORKER_TOKEN="abc123..." API_URL="https://judge.bkdnaioj.com" olpai-volunteer
```

## Todo

- [ ] Tạo `volunteer-agent/` directory structure
- [ ] `config.py`, `capabilities.py`, `client.py`, `storage.py`
- [ ] `worker_judge.py` (adapted)
- [ ] Copy `runner.py` từ `backend/workers/app/`
- [ ] `main.py` — registration flow + poll loop + heartbeat thread
- [ ] `pyproject.toml`, `Dockerfile`
- [ ] Test với local API server

## Success Criteria

- Chạy không có `WORKER_TOKEN` → in hướng dẫn và exit
- Chạy có token → heartbeat gửi mỗi 30s
- Có job → download artifacts, run judge, submit result
- Không có job → sleep `POLL_INTERVAL_S` giây rồi poll lại
- Crash gracefully: log error, submit failed result, tiếp tục poll
