from __future__ import annotations
import platform
import subprocess
import sys

import psutil


def collect() -> dict:
    mem = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    return {
        "os":                    platform.system().lower(),
        "os_version":            platform.version(),
        "cpu_model":             platform.processor(),
        "cpu_cores":             psutil.cpu_count(logical=False),
        "cpu_threads":           psutil.cpu_count(logical=True),
        "ram_gb":                round(mem.total / 1024 ** 3, 1),
        "available_ram_bytes":   mem.available,
        "disk_free_gb":          round(disk.free / 1024 ** 3, 1),
        "available_disk_bytes":  disk.free,
        "python_version":        sys.version,
        "docker_available":      _check_docker(),
        "gpu":                   _collect_gpu(),
    }


def get_resource_usage() -> tuple[int, int]:
    cpu = int(psutil.cpu_percent(interval=1))
    ram = int(psutil.virtual_memory().percent)
    return cpu, ram


def _check_docker() -> bool:
    try:
        result = subprocess.run(["docker", "info"], capture_output=True, timeout=5)
        return result.returncode == 0
    except Exception:
        return False


def _collect_gpu() -> list[dict]:
    try:
        import pynvml  # type: ignore
        pynvml.nvmlInit()
        gpus = []
        for i in range(pynvml.nvmlDeviceGetCount()):
            h = pynvml.nvmlDeviceGetHandleByIndex(i)
            info = pynvml.nvmlDeviceGetMemoryInfo(h)
            name = pynvml.nvmlDeviceGetName(h)
            if isinstance(name, bytes):
                name = name.decode()
            gpus.append({
                "model":   name,
                "vram_gb": round(info.total / 1024 ** 3, 1),
                "cuda":    True,
            })
        return gpus
    except Exception:
        return []
