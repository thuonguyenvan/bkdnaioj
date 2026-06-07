from __future__ import annotations

import os
import tempfile
import unittest
import zipfile

from app.worker_judge import VolunteerJudgeWorker


class VolunteerJudgeWorkerTest(unittest.TestCase):
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


if __name__ == "__main__":
    unittest.main()
