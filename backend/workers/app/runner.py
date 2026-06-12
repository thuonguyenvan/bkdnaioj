from __future__ import annotations

import json
import os
import subprocess

DEFAULT_SANDBOX_IMAGE = "olpai-final-runtime:latest"


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
            image_name = os.getenv("OLPAI_SANDBOX_IMAGE", DEFAULT_SANDBOX_IMAGE)
            try:
                client.images.get(image_name)
            except docker.errors.ImageNotFound as exc:
                raise RuntimeError(
                    f"final inference runtime image '{image_name}' is not installed. "
                    "Build it with: docker build -f runtime/Dockerfile "
                    "-t olpai-final-runtime:latest ."
                ) from exc

            volume_name = os.getenv("SHARED_TEMP_VOLUME_NAME", "olpai_shared_temp")
            memory_limit = os.getenv("OLPAI_SANDBOX_MEMORY", "8g")
            cpu_limit = max(1.0, float(os.getenv("OLPAI_SANDBOX_CPUS", "4")))
            pids_limit = max(64, int(os.getenv("OLPAI_SANDBOX_PIDS", "256")))
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
                mem_limit=memory_limit,
                nano_cpus=int(cpu_limit * 1_000_000_000),
                pids_limit=pids_limit,
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
        try:
            lines = [line for line in (p.stdout or "").splitlines() if line.strip()]
            if not lines:
                raise json.JSONDecodeError("no output", "", 0)
            out = json.loads(lines[-1])
        except json.JSONDecodeError as exc:
            stdout = (p.stdout or "").strip()
            stderr = (p.stderr or "").strip()
            detail = stdout or stderr or "no output"
            raise RuntimeError(f"judge returned invalid JSON: {detail}") from exc
        if out.get("status") != "success":
            raise RuntimeError(out.get("message") or "judge failed")
        return out

    def _run_command(self, command: list[str], *, timeout: int, label: str) -> subprocess.CompletedProcess[str]:
        try:
            p = subprocess.run(
                command,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            stderr = (exc.stderr or "").strip()
            stdout = (exc.stdout or "").strip()
            detail = stderr or stdout
            suffix = f": {detail}" if detail else ""
            raise RuntimeError(f"{label} command timed out after {timeout}s{suffix}") from None
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
