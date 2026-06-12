from __future__ import annotations

import json
import os
import shutil
import tempfile
import zipfile

import structlog

from .db import DB
from .queue import Streams
from .runner import PhaseRunner
from .storage import ObjectStore


log = structlog.get_logger()


class JudgeWorker:
    def __init__(self, *, db: DB, streams: Streams, stream_results: str, store: ObjectStore) -> None:
        self._db = db
        self._streams = streams
        self._stream_results = stream_results
        self._store = store
        self._runner = PhaseRunner()

    def __call__(self, env: dict) -> None:
        sub_id = env.get("submission_id")
        if not sub_id:
            raise RuntimeError("missing submission_id")

        with self._db.connect() as conn:
            with conn.transaction():
                sub = self._db.get_submission(conn, sub_id)
                submission_files = self._db.list_submission_files(conn, sub_id)
                phase_assets = self._db.list_evaluation_set_assets(conn, sub.evaluation_set_id)
                task_assets = self._db.list_task_assets(conn, sub.task_id)
                self._db.mark_running(conn, sub_id)
        temp_dir = "/app/shared-temp" if os.path.isdir("/app/shared-temp") else None
        try:
            with tempfile.TemporaryDirectory(prefix=f"olpai-sub-{sub_id}-", dir=temp_dir) as td:
                result = self._run_with_artifacts(td, sub, submission_files, phase_assets, task_assets)
            payload_json = self._runner.payload_json(result.get("payload"))
            with self._db.connect() as conn:
                with conn.transaction():
                    self._db.mark_done(
                        conn,
                        sub_id,
                        raw_score=float(result["raw_score"]),
                        display_score=float(result["display_score"]),
                        score_payload_json=payload_json,
                    )
            self._streams.emit_result(self._stream_results, sub_id, "done")
        except Exception as e:
            self.mark_failed(env, str(e))
            raise

    def _run_with_artifacts(self, work_dir: str, sub, submission_files: list, phase_assets: list, task_assets: list) -> dict:
        submission_dir = os.path.join(work_dir, "submission")
        assets_dir = os.path.join(work_dir, "assets")
        output_dir = os.path.join(work_dir, "output")
        generated_dir = os.path.join(work_dir, "generated")
        os.makedirs(submission_dir, exist_ok=True)
        os.makedirs(assets_dir, exist_ok=True)

        submission_paths = []
        asset_paths = {}

        for f in submission_files:
            dest = self._safe_dest(submission_dir, f.original_filename)
            submission_paths.append(self._store.download(f.storage_path, dest))

        for a in phase_assets + task_assets:
            dest = self._safe_dest(assets_dir, a.original_filename)
            downloaded = self._store.download(a.storage_path, dest)
            key_dest = self._safe_dest(assets_dir, a.asset_key)
            if a.asset_key.endswith(".py"):
                if os.path.abspath(key_dest) != os.path.abspath(downloaded):
                    shutil.copyfile(downloaded, key_dest)
                asset_paths[a.asset_key] = key_dest
            elif zipfile.is_zipfile(downloaded):
                self._extract_zip_asset(downloaded, key_dest)
                asset_paths[a.asset_key] = key_dest
            else:
                self._copy_file_asset_to_key_dir(downloaded, key_dest)
                asset_paths[a.asset_key] = key_dest
            self._normalize_asset_key_path(assets_dir, a.asset_key, a.original_filename)
            log.info(
                "asset_prepared",
                key=a.asset_key,
                original_filename=a.original_filename,
                key_path=os.path.join(assets_dir, a.asset_key),
                key_is_dir=os.path.isdir(os.path.join(assets_dir, a.asset_key)),
                key_is_file=os.path.isfile(os.path.join(assets_dir, a.asset_key)),
            )
            asset_paths[a.original_filename] = downloaded

        schema = self._load_schema(sub.submission_schema)
        context_path = os.path.join(work_dir, "context.json")
        with open(context_path, "w", encoding="utf-8") as fh:
            json.dump(
                {
                    "submission_id": sub.id,
                    "contest_id": sub.contest_id,
                    "contest_entry_id": sub.contest_entry_id,
                    "task_id": sub.task_id,
                    "phase_id": sub.phase_id,
                    "contest_phase_def_id": sub.contest_phase_def_id,
                    "evaluation_set_id": sub.evaluation_set_id,
                    "is_final": sub.is_final,
                    "judge_key": sub.judge_key,
                    "submission_schema": schema,
                },
                fh,
            )

        judge = self._resolve_judge(sub.judge_key, asset_paths, assets_dir)
        self._extract_submission_archives(submission_paths, submission_dir)
        if sub.is_final:
            inference = self._resolve_inference_entrypoint(schema, submission_dir)
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

    def _resolve_judge(self, judge_key: str, asset_paths: dict, assets_dir: str) -> str:
        candidates = [
            judge_key,
            "judge.py",
            "judge_script",
        ]
        for key in candidates:
            if not key:
                continue
            if key in asset_paths:
                path = asset_paths[key]
                if path.endswith(".py"):
                    return path
            path = os.path.join(assets_dir, key)
            if os.path.isfile(path) and path.endswith(".py"):
                return path
        raise RuntimeError(f"missing judge entrypoint {judge_key or 'judge.py'}")

    def _resolve_inference_entrypoint(self, schema: dict, submission_dir: str) -> str:
        final_schema = schema.get("final") if isinstance(schema, dict) else {}
        configured = None
        if isinstance(final_schema, dict):
            configured = final_schema.get("inference_entrypoint")
        candidates = [configured, "infer.py"]
        root = os.path.abspath(submission_dir)
        for name in candidates:
            if not name:
                continue
            path = os.path.abspath(os.path.join(submission_dir, name))
            if path != root and not path.startswith(root + os.sep):
                raise RuntimeError(f"inference_entrypoint escapes submission directory: {name}")
            if os.path.isfile(path):
                return path
        raise RuntimeError(f"inference entrypoint not found ({configured or 'infer.py'})")

    def _extract_submission_archives(self, paths: list[str], submission_dir: str) -> None:
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

    def _extract_zip_asset(self, path: str, dest_dir: str) -> None:
        os.makedirs(dest_dir, exist_ok=True)
        with zipfile.ZipFile(path) as zf:
            root = os.path.abspath(dest_dir)
            for info in zf.infolist():
                dest = os.path.abspath(os.path.join(dest_dir, info.filename))
                if dest != root and not dest.startswith(root + os.sep):
                    raise RuntimeError(f"unsafe zip entry in asset {os.path.basename(path)}")
            zf.extractall(dest_dir)

    def _copy_file_asset_to_key_dir(self, path: str, dest_dir: str) -> None:
        os.makedirs(dest_dir, exist_ok=True)
        dest = os.path.join(dest_dir, os.path.basename(path))
        if os.path.abspath(dest) != os.path.abspath(path):
            shutil.copyfile(path, dest)

    def _normalize_asset_key_path(self, assets_dir: str, key: str, original_filename: str) -> None:
        if key.endswith(".py"):
            return
        key_path = os.path.join(assets_dir, key)
        if os.path.isdir(key_path) or not os.path.isfile(key_path):
            return

        source_copy = os.path.join(assets_dir, original_filename)
        if os.path.abspath(source_copy) == os.path.abspath(key_path):
            source_copy = key_path + ".file"
            shutil.copyfile(key_path, source_copy)

        tmp_dir = key_path + ".dir"
        if os.path.exists(tmp_dir):
            shutil.rmtree(tmp_dir)
        os.makedirs(tmp_dir, exist_ok=True)
        if zipfile.is_zipfile(key_path):
            self._extract_zip_asset(key_path, tmp_dir)
        else:
            shutil.copyfile(key_path, os.path.join(tmp_dir, os.path.basename(original_filename)))
        os.remove(key_path)
        os.replace(tmp_dir, key_path)

    def _load_schema(self, raw: str) -> dict:
        try:
            loaded = json.loads(raw or "{}")
            return loaded if isinstance(loaded, dict) else {}
        except json.JSONDecodeError:
            return {}

    def _safe_dest(self, root: str, name: str) -> str:
        cleaned = os.path.normpath(name).lstrip(os.sep)
        if cleaned.startswith(".."):
            cleaned = os.path.basename(cleaned)
        dest = os.path.abspath(os.path.join(root, cleaned))
        abs_root = os.path.abspath(root)
        if dest != abs_root and not dest.startswith(abs_root + os.sep):
            raise RuntimeError(f"unsafe artifact path: {name}")
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        return dest

    def mark_failed(self, env: dict, error_message: str) -> None:
        sub_id = env.get("submission_id")
        if not sub_id:
            return
        with self._db.connect() as conn:
            with conn.transaction():
                self._db.mark_failed(conn, sub_id, error_message)
        self._streams.emit_result(self._stream_results, sub_id, "failed")
        log.info("submission_failed", submission_id=sub_id)
