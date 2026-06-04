from __future__ import annotations
import os
import socket
import tomllib
from dataclasses import dataclass, field
from pathlib import Path


CONFIG_DIR  = Path.home() / ".olpai" / "agent"
CONFIG_FILE = CONFIG_DIR / "config.toml"


@dataclass
class Settings:
    api_url:              str  = "https://api.bkdnaioj.app"
    worker_name:          str  = field(default_factory=lambda: socket.gethostname())
    worker_token:         str  = ""
    max_workers:          int  = 1
    poll_interval_s:      int  = 10
    heartbeat_interval_s: int  = 30
    sandbox_timeout_s:    int  = 600
    temp_dir:             str  = ""
    log_level:            str  = "INFO"


def load() -> Settings:
    """Load from config file, then override with env vars."""
    s = Settings()

    if CONFIG_FILE.exists():
        with open(CONFIG_FILE, "rb") as f:
            data = tomllib.load(f)
        for k, v in data.items():
            if hasattr(s, k):
                setattr(s, k, v)

    # Env vars always win
    overrides = {
        "api_url":              os.getenv("API_URL"),
        "worker_name":          os.getenv("WORKER_NAME"),
        "worker_token":         os.getenv("WORKER_TOKEN"),
        "max_workers":          os.getenv("MAX_WORKERS"),
        "poll_interval_s":      os.getenv("POLL_INTERVAL_S"),
        "heartbeat_interval_s": os.getenv("HEARTBEAT_INTERVAL_S"),
        "sandbox_timeout_s":    os.getenv("SANDBOX_TIMEOUT_S"),
        "temp_dir":             os.getenv("TEMP_DIR"),
        "log_level":            os.getenv("LOG_LEVEL"),
    }
    for k, v in overrides.items():
        if v is not None:
            attr_type = type(getattr(s, k))
            setattr(s, k, attr_type(v))

    s.api_url = s.api_url.rstrip("/")
    return s


def save(s: Settings) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    lines = [
        f'api_url = "{s.api_url}"',
        f'worker_name = "{s.worker_name}"',
        f'worker_token = "{s.worker_token}"',
        f'max_workers = {s.max_workers}',
        f'poll_interval_s = {s.poll_interval_s}',
        f'heartbeat_interval_s = {s.heartbeat_interval_s}',
        f'sandbox_timeout_s = {s.sandbox_timeout_s}',
    ]
    if s.temp_dir:
        lines.append(f'temp_dir = "{s.temp_dir}"')
    lines.append(f'log_level = "{s.log_level}"')
    CONFIG_FILE.write_text("\n".join(lines) + "\n")
