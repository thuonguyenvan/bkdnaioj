"""Local disk cache for static judge artifacts (judge.py, inputs, ground_truth).

Submission files are NOT cached — they change every submission.
Assets are cached by key+sha256, re-downloaded only when hash mismatches.
"""
from __future__ import annotations

import hashlib
import os
import shutil
from pathlib import Path

import structlog

from . import storage as store

log = structlog.get_logger()

DEFAULT_CACHE_DIR = Path.home() / ".olpai" / "agent" / "cache"


class ArtifactCache:
    def __init__(self, cache_dir: Path | None = None) -> None:
        self._dir = Path(cache_dir) if cache_dir else DEFAULT_CACHE_DIR
        self._dir.mkdir(parents=True, exist_ok=True)

    def get(self, cache_key: str, url: str, sha256: str | None) -> str:
        """Return local path for artifact, downloading only if not cached/stale."""
        safe_key = cache_key.replace("/", "_").replace(" ", "_")
        dest = self._dir / safe_key

        if dest.exists():
            if sha256 is None or _sha256_file(dest) == sha256:
                log.debug("cache_hit", key=cache_key)
                return str(dest)
            else:
                log.info("cache_stale", key=cache_key)
                dest.unlink()

        log.info("cache_miss_downloading", key=cache_key)
        store.download_url(url, str(dest))
        return str(dest)

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
