from __future__ import annotations

import json
import os
import subprocess
import tempfile


class PhaseRunner:
    def run_public(self, *, judge: str, pred: str, gt: str) -> dict:
        return self._run_judge(judge=judge, pred=pred, gt=gt)

    def run_final(self, *, judge: str, submission_zip: str, inputs_dir: str, gt: str) -> dict:
        with tempfile.TemporaryDirectory(prefix="olpai-final-") as td:
            sub_dir = os.path.join(td, "sub")
            out_dir = os.path.join(td, "out")
            os.makedirs(sub_dir, exist_ok=True)
            os.makedirs(out_dir, exist_ok=True)

            subprocess.run(["python", "-m", "zipfile", "-e", submission_zip, sub_dir], check=True)

            infer = os.path.join(sub_dir, "infer.py")
            model = os.path.join(sub_dir, "model.txt")
            subprocess.run(
                ["python", infer, "--input", inputs_dir, "--output", out_dir, "--model", model],
                check=True,
                timeout=int(os.getenv("SANDBOX_TIMEOUT_S", "300")),
            )

            pred = os.path.join(out_dir, "predictions.csv")
            return self._run_judge(judge=judge, pred=pred, gt=gt)

    def _run_judge(self, *, judge: str, pred: str, gt: str) -> dict:
        p = subprocess.run(["python", judge, "--pred", pred, "--gt", gt], capture_output=True, text=True, check=True)
        out = json.loads(p.stdout.strip())
        if out.get("status") != "success":
            raise RuntimeError(out.get("message") or "judge failed")
        return out

    def payload_json(self, payload: dict | None) -> str | None:
        if payload is None:
            return None
        return json.dumps(payload)
