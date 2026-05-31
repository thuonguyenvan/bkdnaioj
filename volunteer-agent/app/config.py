from __future__ import annotations
import os


class Settings:
    api_url: str
    worker_token: str
    worker_name: str
    poll_interval_s: int
    heartbeat_interval_s: int
    sandbox_timeout_s: int
    temp_dir: str | None
    log_level: str

    def __init__(self) -> None:
        self.api_url              = os.getenv("API_URL", "http://localhost:8080").rstrip("/")
        self.worker_token         = os.getenv("WORKER_TOKEN", "")
        self.worker_name          = os.getenv("WORKER_NAME", "") or _hostname()
        self.poll_interval_s      = int(os.getenv("POLL_INTERVAL_S", "10"))
        self.heartbeat_interval_s = int(os.getenv("HEARTBEAT_INTERVAL_S", "30"))
        self.sandbox_timeout_s    = int(os.getenv("SANDBOX_TIMEOUT_S", "600"))
        self.temp_dir             = os.getenv("TEMP_DIR") or None
        self.log_level            = os.getenv("LOG_LEVEL", "INFO")


def _hostname() -> str:
    import socket
    return socket.gethostname()
