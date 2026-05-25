from __future__ import annotations

import json
import os
import subprocess


class PhaseRunner:
    def run_non_final(self, *, judge: str, submission_dir: str, assets_dir: str, output_dir: str, context_path: str) -> dict:
        return self._run_judge(
            judge=judge,
            submission_dir=submission_dir,
            assets_dir=assets_dir,
            output_dir=output_dir,
            context_path=context_path,
        )

    def run_final(
        self,
        *,
        inference_entrypoint: str,
        judge: str,
        submission_dir: str,
        assets_dir: str,
        generated_dir: str,
        output_dir: str,
        context_path: str,
    ) -> dict:
        os.makedirs(generated_dir, exist_ok=True)
        subprocess.run(
            [
                "python",
                inference_entrypoint,
                "--submission-dir",
                submission_dir,
                "--assets-dir",
                assets_dir,
                "--output-dir",
                generated_dir,
                "--context",
                context_path,
            ],
            check=True,
            timeout=int(os.getenv("SANDBOX_TIMEOUT_S", "300")),
        )
        return self._run_judge(
            judge=judge,
            submission_dir=generated_dir,
            assets_dir=assets_dir,
            output_dir=output_dir,
            context_path=context_path,
        )

    def _run_judge(self, *, judge: str, submission_dir: str, assets_dir: str, output_dir: str, context_path: str) -> dict:
        os.makedirs(output_dir, exist_ok=True)
        p = subprocess.run(
            [
                "python",
                judge,
                "--submission-dir",
                submission_dir,
                "--assets-dir",
                assets_dir,
                "--output-dir",
                output_dir,
                "--context",
                context_path,
            ],
            capture_output=True,
            text=True,
            check=True,
            timeout=int(os.getenv("SANDBOX_TIMEOUT_S", "300")),
        )
        out = json.loads(p.stdout.strip())
        if out.get("status") != "success":
            raise RuntimeError(out.get("message") or "judge failed")
        return out

    def payload_json(self, payload: dict | None) -> str | None:
        if payload is None:
            return None
        return json.dumps(payload)
