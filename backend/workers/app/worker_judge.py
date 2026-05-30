from __future__ import annotations

import os
import tempfile

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
                self._db.mark_running(conn, sub_id)

        try:
            with tempfile.TemporaryDirectory(prefix=f"olpai-sub-{sub_id}-") as td:
                result = self._run_with_artifacts(td, sub.is_final, submission_files, phase_assets)
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

    def _run_with_artifacts(self, work_dir: str, is_final: bool, submission_files: list, phase_assets: list) -> dict:
        sub_paths = {}
        asset_paths = {}

        for f in submission_files:
            dest = os.path.join(work_dir, "submission", f.original_filename)
            sub_paths[f.original_filename] = self._store.download(f.storage_path, dest)

        for a in phase_assets:
            dest = os.path.join(work_dir, "phase", a.original_filename)
            downloaded = self._store.download(a.storage_path, dest)
            asset_paths[a.asset_key] = downloaded
            asset_paths[a.original_filename] = downloaded

        judge = asset_paths.get("judge.py") or asset_paths.get("judge_script")
        gt = asset_paths.get("ground_truth.csv") or asset_paths.get("public_ground_truth.csv")
        inputs_dir = os.path.dirname(gt) if gt else None

        if not judge:
            raise RuntimeError("missing phase asset: judge.py")
        if not gt:
            raise RuntimeError("missing phase asset: ground_truth.csv")

        if is_final:
            submission_zip = next((p for name, p in sub_paths.items() if name.endswith(".zip")), None)
            if not submission_zip:
                raise RuntimeError("missing final submission zip")
            return self._runner.run_final(judge=judge, submission_zip=submission_zip, inputs_dir=inputs_dir, gt=gt)

        pred = sub_paths.get("predictions.csv")
        if not pred:
            raise RuntimeError("missing public predictions.csv")
        return self._runner.run_public(judge=judge, pred=pred, gt=gt)

    def mark_failed(self, env: dict, error_message: str) -> None:
        sub_id = env.get("submission_id")
        if not sub_id:
            return
        with self._db.connect() as conn:
            with conn.transaction():
                self._db.mark_failed(conn, sub_id, error_message)
        self._streams.emit_result(self._stream_results, sub_id, "failed")
        log.info("submission_failed", submission_id=sub_id)
