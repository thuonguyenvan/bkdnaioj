from __future__ import annotations

import os
import tempfile
import textwrap
import unittest

from app.runner import PhaseRunner


class PhaseRunnerTest(unittest.TestCase):
    def test_judge_failure_includes_stderr(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            judge = os.path.join(temp_dir, "judge.py")
            self._write_script(
                judge,
                """
                import sys
                print("missing torch dependency", file=sys.stderr)
                raise SystemExit(7)
                """,
            )

            with self.assertRaisesRegex(
                RuntimeError,
                "judge command failed with exit 7: missing torch dependency",
            ):
                PhaseRunner().run_non_final(
                    judge=judge,
                    submission_dir=temp_dir,
                    assets_dir=temp_dir,
                    output_dir=os.path.join(temp_dir, "output"),
                    context_path=os.path.join(temp_dir, "context.json"),
                )

    def test_judge_invalid_json_includes_output(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            judge = os.path.join(temp_dir, "judge.py")
            self._write_script(judge, 'print("not-json")')

            with self.assertRaisesRegex(
                RuntimeError,
                "judge returned invalid JSON: not-json",
            ):
                PhaseRunner().run_non_final(
                    judge=judge,
                    submission_dir=temp_dir,
                    assets_dir=temp_dir,
                    output_dir=os.path.join(temp_dir, "output"),
                    context_path=os.path.join(temp_dir, "context.json"),
                )

    def _write_script(self, path: str, source: str) -> None:
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(textwrap.dedent(source).strip())


if __name__ == "__main__":
    unittest.main()
