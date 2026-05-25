from __future__ import annotations

import os
import shutil
import sys
import tempfile
import textwrap
import types
import unittest
import zipfile
from dataclasses import dataclass

structlog_stub = types.ModuleType("structlog")
structlog_stub.get_logger = lambda: types.SimpleNamespace(info=lambda *args, **kwargs: None)
sys.modules.setdefault("structlog", structlog_stub)
sys.modules.setdefault("psycopg", types.ModuleType("psycopg"))
redis_stub = types.ModuleType("redis")
redis_stub.Redis = types.SimpleNamespace(from_url=lambda *args, **kwargs: None)
redis_stub.exceptions = types.SimpleNamespace(ResponseError=Exception)
sys.modules.setdefault("redis", redis_stub)
minio_stub = types.ModuleType("minio")
minio_stub.Minio = lambda *args, **kwargs: None
sys.modules.setdefault("minio", minio_stub)

from app.worker_judge import JudgeWorker


@dataclass(frozen=True)
class FileRef:
    original_filename: str
    storage_path: str


@dataclass(frozen=True)
class AssetRef:
    asset_key: str
    original_filename: str
    storage_path: str


@dataclass(frozen=True)
class SubmissionRef:
    id: str = "sub-1"
    contest_id: str = "contest-1"
    contest_entry_id: str = "entry-1"
    task_id: str = "task-1"
    phase_id: str = "phase-1"
    judge_key: str = "judge.py"
    contest_phase_def_id: str = "def-1"
    evaluation_set_id: str = "eval-1"
    is_final: bool = False
    submission_schema: str = "{}"


class FakeStore:
    def download(self, storage_path: str, dest: str) -> str:
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        shutil.copyfile(storage_path, dest)
        return dest


class ContractRunnerTest(unittest.TestCase):
    def test_non_final_judges_generic_artifact_directory(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            artifact = os.path.join(td, "images.zip")
            with open(artifact, "wb") as fh:
                fh.write(b"fake image archive")
            judge = os.path.join(td, "judge.py")
            self._write_script(
                judge,
                """
                import argparse, json, os
                p = argparse.ArgumentParser()
                p.add_argument("--submission-dir")
                p.add_argument("--assets-dir")
                p.add_argument("--output-dir")
                p.add_argument("--context")
                args = p.parse_args()
                assert os.path.exists(os.path.join(args.submission_dir, "images.zip"))
                print(json.dumps({"status":"success","raw_score":0.7,"display_score":70,"payload":{"mode":"non_final"}}))
                """,
            )
            worker = JudgeWorker(db=None, streams=None, stream_results="unused", store=FakeStore())

            result = worker._run_with_artifacts(
                td,
                SubmissionRef(is_final=False),
                [FileRef("images.zip", artifact)],
                [AssetRef("judge.py", "judge.py", judge)],
            )

            self.assertEqual(result["display_score"], 70)
            self.assertEqual(result["payload"]["mode"], "non_final")

    def test_final_extracts_archive_runs_inference_then_judge(self) -> None:
        with tempfile.TemporaryDirectory() as td:
            final_zip = os.path.join(td, "final_submission.zip")
            with zipfile.ZipFile(final_zip, "w") as zf:
                zf.writestr(
                    "infer.py",
                    textwrap.dedent(
                        """
                        import argparse, os
                        p = argparse.ArgumentParser()
                        p.add_argument("--submission-dir")
                        p.add_argument("--assets-dir")
                        p.add_argument("--output-dir")
                        p.add_argument("--context")
                        args = p.parse_args()
                        os.makedirs(args.output_dir, exist_ok=True)
                        with open(os.path.join(args.output_dir, "generated_images.zip"), "wb") as fh:
                            fh.write(b"generated")
                        """
                    ).strip(),
                )
            judge = os.path.join(td, "judge.py")
            self._write_script(
                judge,
                """
                import argparse, json, os
                p = argparse.ArgumentParser()
                p.add_argument("--submission-dir")
                p.add_argument("--assets-dir")
                p.add_argument("--output-dir")
                p.add_argument("--context")
                args = p.parse_args()
                assert os.path.exists(os.path.join(args.submission_dir, "generated_images.zip"))
                print(json.dumps({"status":"success","raw_score":0.9,"display_score":90,"payload":{"mode":"final"}}))
                """,
            )
            worker = JudgeWorker(db=None, streams=None, stream_results="unused", store=FakeStore())

            result = worker._run_with_artifacts(
                td,
                SubmissionRef(is_final=True, submission_schema='{"final":{"inference_entrypoint":"infer.py"}}'),
                [FileRef("final_submission.zip", final_zip)],
                [AssetRef("judge.py", "judge.py", judge)],
            )

            self.assertEqual(result["display_score"], 90)
            self.assertEqual(result["payload"]["mode"], "final")

    def _write_script(self, path: str, source: str) -> None:
        with open(path, "w", encoding="utf-8") as fh:
            fh.write(textwrap.dedent(source).strip())


if __name__ == "__main__":
    unittest.main()
