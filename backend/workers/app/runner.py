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
        is_docker_env = os.path.isdir("/app/shared-temp") and os.path.exists("/var/run/docker.sock")
        if is_docker_env:
            import docker
            client = docker.from_env()
            timeout = int(os.getenv("SANDBOX_TIMEOUT_S", "300"))
            image_name = "python:3.11-slim"
            try:
                client.images.get(image_name)
            except docker.errors.ImageNotFound:
                client.images.pull("python", tag="3.11-slim")

            volume_name = os.getenv("SHARED_TEMP_VOLUME_NAME", "olpai_shared_temp")
            container = client.containers.create(
                image=image_name,
                command=[
                    "python",
                    inference_entrypoint,
                    "--submission-dir", submission_dir,
                    "--assets-dir", assets_dir,
                    "--output-dir", generated_dir,
                    "--context", context_path,
                ],
                volumes={volume_name: {"bind": "/app/shared-temp", "mode": "rw"}},
                network_mode="none",
                mem_limit="512m",
                nano_cpus=1000000000,
            )
            container.start()
            try:
                result = container.wait(timeout=timeout)
                exit_code = result.get("StatusCode", 0)
                if exit_code != 0:
                    logs = container.logs().decode("utf-8")
                    raise RuntimeError(f"Sandbox container failed (exit {exit_code}): {logs}")
            except Exception as e:
                try:
                    container.kill()
                except Exception:
                    pass
                raise RuntimeError(f"Sandbox execution failed or timed out: {str(e)}") from e
            finally:
                try:
                    container.remove(force=True)
                except Exception:
                    pass
        else:
            self._run_command(
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
                timeout=int(os.getenv("SANDBOX_TIMEOUT_S", "300")),
                label="inference",
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
        p = self._run_command(
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
            timeout=int(os.getenv("SANDBOX_TIMEOUT_S", "300")),
            label="judge",
        )
        out = json.loads(p.stdout.strip())
        if out.get("status") != "success":
            raise RuntimeError(out.get("message") or "judge failed")
        return out

    def _run_command(self, command: list[str], *, timeout: int, label: str) -> subprocess.CompletedProcess[str]:
        p = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        if p.returncode != 0:
            stderr = (p.stderr or "").strip()
            stdout = (p.stdout or "").strip()
            detail = stderr or stdout or "no output"
            raise RuntimeError(f"{label} command failed with exit {p.returncode}: {detail}")
        return p

    def payload_json(self, payload: dict | None) -> str | None:
        if payload is None:
            return None
        return json.dumps(payload)
