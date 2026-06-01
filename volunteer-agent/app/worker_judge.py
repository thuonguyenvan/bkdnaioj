from __future__ import annotations

import json
import os
import shutil
import tempfile
import zipfile

import structlog

from .artifact_cache import ArtifactCache
from .client import Artifact, Job
from .runner import PhaseRunner
from . import storage as store

log = structlog.get_logger()


class VolunteerJudgeWorker:
    def __init__(self, runner: PhaseRunner, cache: ArtifactCache | None = None) -> None:
        self._runner = runner
        self._cache  = cache or ArtifactCache()

    def run(self, job: Job, work_dir: str) -> dict:
        submission_dir = os.path.join(work_dir, "submission")
        assets_dir     = os.path.join(work_dir, "assets")
        output_dir     = os.path.join(work_dir, "output")
        generated_dir  = os.path.join(work_dir, "generated")
        os.makedirs(submission_dir, exist_ok=True)
        os.makedirs(assets_dir,     exist_ok=True)

        asset_paths: dict[str, str] = {}

        for artifact in job.artifacts:
            if artifact.type == "submission":
                # Submission files: always download fresh, never cache
                dest = _safe_dest(submission_dir, artifact.original_filename)
                store.download_url(artifact.url, dest)

            else:
                # Static assets (judge.py, inputs, ground_truth): cache on disk
                cache_key = f"{artifact.key}__{artifact.original_filename}"
                sha256    = getattr(artifact, "sha256", None)

                cached = self._cache.get(cache_key, artifact.url, sha256)

                # Copy into assets_dir for this run
                dest = _safe_dest(assets_dir, artifact.original_filename)
                self._cache.symlink_into(cached, dest)

                asset_paths[artifact.original_filename] = dest
                asset_paths[artifact.key]               = dest

                # Also copy to asset_key filename if different
                key_dest = _safe_dest(assets_dir, artifact.key)
                if os.path.abspath(key_dest) != os.path.abspath(dest):
                    shutil.copyfile(dest, key_dest)

        context_path = os.path.join(work_dir, "context.json")
        with open(context_path, "w", encoding="utf-8") as fh:
            json.dump(job.context, fh)

        judge = _resolve_judge(job.judge_key, asset_paths, assets_dir)

        if job.is_final:
            self._extract_final_archives(_submission_paths(submission_dir), submission_dir)
            inference = self._resolve_inference(job.context.get("submission_schema", {}), submission_dir)
            return self._runner.run_final(
                inference_entrypoint=inference,
                judge=judge,
                submission_dir=submission_dir,
                assets_dir=assets_dir,
                generated_dir=generated_dir,
                output_dir=output_dir,
                context_path=context_path,
            )

        return self._runner.run_non_final(
            judge=judge,
            submission_dir=submission_dir,
            assets_dir=assets_dir,
            output_dir=output_dir,
            context_path=context_path,
        )

    def _resolve_inference(self, schema: dict | str, submission_dir: str) -> str:
        if isinstance(schema, str):
            try:
                schema = json.loads(schema)
            except Exception:
                schema = {}
        final_schema = schema.get("final") if isinstance(schema, dict) else {}
        configured = None
        if isinstance(final_schema, dict):
            configured = final_schema.get("inference_entrypoint")
        for name in [configured, "infer.py"]:
            if not name:
                continue
            path = os.path.join(submission_dir, name)
            if os.path.isfile(path):
                return path
        raise RuntimeError(f"inference entrypoint not found ({configured or 'infer.py'})")

    def _extract_final_archives(self, paths: list[str], submission_dir: str) -> None:
        for path in paths:
            if not zipfile.is_zipfile(path):
                continue
            with zipfile.ZipFile(path) as zf:
                for info in zf.infolist():
                    dest = os.path.abspath(os.path.join(submission_dir, info.filename))
                    root = os.path.abspath(submission_dir)
                    if dest != root and not dest.startswith(root + os.sep):
                        raise RuntimeError("unsafe zip entry in final submission")
                zf.extractall(submission_dir)


def _submission_paths(submission_dir: str) -> list[str]:
    paths = []
    for name in os.listdir(submission_dir):
        paths.append(os.path.join(submission_dir, name))
    return paths


def _resolve_judge(judge_key: str, asset_paths: dict[str, str], assets_dir: str) -> str:
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


def _safe_dest(root: str, name: str) -> str:
    cleaned = os.path.normpath(name).lstrip(os.sep)
    if cleaned.startswith(".."):
        cleaned = os.path.basename(cleaned)
    dest = os.path.abspath(os.path.join(root, cleaned))
    abs_root = os.path.abspath(root)
    if dest != abs_root and not dest.startswith(abs_root + os.sep):
        raise RuntimeError(f"unsafe artifact path: {name}")
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    return dest
