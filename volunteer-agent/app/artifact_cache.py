"""Local disk cache for static judge artifacts (judge.py, inputs, ground_truth).

Submission files are NOT cached — they change every submission.
Assets are cached by key+sha256, re-downloaded only when hash mismatches.
"""
from __future__ import annotations

import hashlib
import os
import shutil
import tempfile
import threading
import time
from pathlib import Path

import structlog

from . import storage as store

log = structlog.get_logger()

DEFAULT_CACHE_DIR = Path.home() / ".olpai" / "agent" / "cache"


class ArtifactCache:
    def __init__(self, cache_dir: Path | None = None) -> None:
        self._dir = Path(cache_dir) if cache_dir else DEFAULT_CACHE_DIR
        self._dir.mkdir(parents=True, exist_ok=True)
        self._locks_guard = threading.Lock()
        self._locks: dict[str, threading.Lock] = {}

    def get(self, cache_key: str, url: str, sha256: str | None) -> str:
        """Return local path for artifact, downloading only if not cached/stale."""
        path, _ = self.get_with_metadata(cache_key, url, sha256)
        return path

    def get_with_metadata(self, cache_key: str, url: str, sha256: str | None) -> tuple[str, dict]:
        """Return local path and cache/download timing metadata."""
        safe_key = cache_key.replace("/", "_").replace(" ", "_")
        dest = self._dir / safe_key
        started = time.perf_counter()
        metadata = {
            "cache_key": cache_key,
            "cache_hit": False,
            "cache_stale": False,
            "download_seconds": 0.0,
            "cache_lookup_seconds": 0.0,
        }

        with self._lock_for(safe_key):
            if dest.exists():
                if sha256 is None or _sha256_file(dest) == sha256:
                    log.debug("cache_hit", key=cache_key)
                    metadata["cache_hit"] = True
                    metadata["cache_lookup_seconds"] = round(time.perf_counter() - started, 6)
                    return str(dest), metadata
                log.info("cache_stale", key=cache_key)
                metadata["cache_stale"] = True
                dest.unlink()

            log.info("cache_miss_downloading", key=cache_key)
            fd, temp_path = tempfile.mkstemp(
                prefix=f".{safe_key}.",
                suffix=".download",
                dir=self._dir,
            )
            os.close(fd)
            try:
                download_started = time.perf_counter()
                store.download_url(url, temp_path)
                metadata["download_seconds"] = round(time.perf_counter() - download_started, 6)
                if sha256 is not None and _sha256_file(Path(temp_path)) != sha256:
                    raise RuntimeError(f"downloaded artifact hash mismatch: {cache_key}")
                os.replace(temp_path, dest)
            finally:
                if os.path.exists(temp_path):
                    os.unlink(temp_path)
            metadata["cache_lookup_seconds"] = round(time.perf_counter() - started, 6)
            return str(dest), metadata

    def _lock_for(self, safe_key: str) -> threading.Lock:
        with self._locks_guard:
            lock = self._locks.get(safe_key)
            if lock is None:
                lock = threading.Lock()
                self._locks[safe_key] = lock
            return lock

    def symlink_into(self, cached_path: str, dest_path: str) -> None:
        """Create a copy (or symlink) of cached file into work_dir."""
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)
        if os.path.exists(dest_path):
            os.unlink(dest_path)
        # Copy instead of symlink — judge scripts may write next to the file
        shutil.copy2(cached_path, dest_path)

    def clear(self) -> int:
        """Remove all cached files. Returns number of files removed."""
        count = 0
        for f in self._dir.iterdir():
            if f.is_file():
                f.unlink()
                count += 1
        return count

    def size_mb(self) -> float:
        total = sum(f.stat().st_size for f in self._dir.iterdir() if f.is_file())
        return round(total / 1024 / 1024, 1)


def _sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()
