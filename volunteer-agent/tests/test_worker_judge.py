from __future__ import annotations

import os
import tempfile
import threading
import unittest
import zipfile
from pathlib import Path
from unittest.mock import patch

from app.artifact_cache import ArtifactCache
from app.client import Artifact, Job
from app.worker_judge import VolunteerJudgeWorker, _artifact_cache_key


class VolunteerJudgeWorkerTest(unittest.TestCase):
    def test_cache_does_not_expose_partial_downloads_to_parallel_workers(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            cache = ArtifactCache(Path(temp_dir))
            download_started = threading.Event()
            release_download = threading.Event()
            results: list[str] = []
            errors: list[Exception] = []
            download_count = 0

            def fake_download(_url: str, dest: str) -> str:
                nonlocal download_count
                download_count += 1
                with open(dest, "wb") as fh:
                    fh.write(b"partial")
                    fh.flush()
                    download_started.set()
                    self.assertTrue(release_download.wait(timeout=2))
                    fh.write(b"-complete")
                return dest

            def get_cached() -> None:
                try:
                    results.append(cache.get("shared-model", "https://example.test/model.zip", None))
                except Exception as exc:
                    errors.append(exc)

            with patch("app.artifact_cache.store.download_url", side_effect=fake_download):
                first = threading.Thread(target=get_cached)
                second = threading.Thread(target=get_cached)
                first.start()
                self.assertTrue(download_started.wait(timeout=2))
                second.start()
                release_download.set()
                first.join(timeout=2)
                second.join(timeout=2)

            self.assertEqual(errors, [])
            self.assertEqual(download_count, 1)
            self.assertEqual(len(results), 2)
            self.assertEqual(results[0], results[1])
            self.assertEqual(Path(results[0]).read_bytes(), b"partial-complete")

    def test_cache_key_is_scoped_by_task_for_task_assets(self) -> None:
        artifact = Artifact(
            type="task_asset",
            key="judge.py",
            original_filename="judge.py",
            url="https://example.test/judge.py",
        )

        self.assertNotEqual(
            _artifact_cache_key(self._job("task-1", "phase-1"), artifact),
            _artifact_cache_key(self._job("task-2", "phase-2"), artifact),
        )

    def test_cache_key_is_scoped_by_phase_for_evaluation_assets(self) -> None:
        artifact = Artifact(
            type="asset",
            key="inputs",
            original_filename="inputs.zip",
            url="https://example.test/inputs.zip",
        )

        self.assertNotEqual(
            _artifact_cache_key(self._job("task-1", "public"), artifact),
            _artifact_cache_key(self._job("task-1", "private"), artifact),
        )

    def test_submission_archive_is_extracted_without_removing_archive(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            archive = os.path.join(temp_dir, "adversarial.zip")
            with zipfile.ZipFile(archive, "w") as zf:
                zf.writestr("id_001.png", b"png")

            worker = VolunteerJudgeWorker.__new__(VolunteerJudgeWorker)
            worker._extract_submission_archives([archive], temp_dir)

            self.assertTrue(os.path.isfile(archive))
            self.assertTrue(os.path.isfile(os.path.join(temp_dir, "id_001.png")))

    def test_submission_archive_rejects_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            archive = os.path.join(temp_dir, "unsafe.zip")
            with zipfile.ZipFile(archive, "w") as zf:
                zf.writestr("../escape.png", b"png")

            worker = VolunteerJudgeWorker.__new__(VolunteerJudgeWorker)
            with self.assertRaisesRegex(RuntimeError, "unsafe zip entry"):
                worker._extract_submission_archives([archive], temp_dir)

    def test_resolve_inference_rejects_path_traversal(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            worker = VolunteerJudgeWorker.__new__(VolunteerJudgeWorker)
            schema = {"final": {"inference_entrypoint": "../../etc/passwd"}}
            with self.assertRaisesRegex(RuntimeError, "escapes submission directory"):
                worker._resolve_inference(schema, temp_dir)

    def test_resolve_inference_rejects_absolute_path(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            worker = VolunteerJudgeWorker.__new__(VolunteerJudgeWorker)
            schema = {"final": {"inference_entrypoint": "/etc/passwd"}}
            with self.assertRaisesRegex(RuntimeError, "escapes submission directory"):
                worker._resolve_inference(schema, temp_dir)

    def test_resolve_inference_finds_valid_entrypoint(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            infer_path = os.path.join(temp_dir, "infer.py")
            open(infer_path, "w").close()
            worker = VolunteerJudgeWorker.__new__(VolunteerJudgeWorker)
            result = worker._resolve_inference({}, temp_dir)
            self.assertEqual(result, infer_path)

    def _job(self, task_id: str, phase_id: str) -> Job:
        return Job(
            submission_id="submission",
            attempt_id="attempt",
            task_id=task_id,
            phase_id=phase_id,
            is_final=False,
            judge_key="judge.py",
            context={},
            artifacts=[],
            timeout_secs=600,
        )


if __name__ == "__main__":
    unittest.main()
