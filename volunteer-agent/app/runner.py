from __future__ import annotations

import json
import os
import subprocess
import tempfile

from . import config as cfg


def _docker_available() -> bool:
    try:
        result = subprocess.run(["docker", "info"], capture_output=True, timeout=5)
        return result.returncode == 0
    except Exception:
        return False


def _create_sandbox_container(client, image_name: str, command: list[str], volumes: dict, timeout: int):
    """Create Docker container with full isolation constraints."""
    return client.containers.create(
        image=image_name,
        command=command,
        volumes=volumes,
        network_mode="none",
        mem_limit="512m",
        nano_cpus=1_000_000_000,  # 1 CPU
        pids_limit=64,            # prevent fork bomb
    )


class PhaseRunner:
    def run_non_final(self, *, judge: str, submission_dir: str, assets_dir: str, output_dir: str, context_path: str) -> dict:
        use_sandbox = os.getenv("JUDGE_SANDBOX", "0") == "1"
        return self._run_judge(
            judge=judge,
            submission_dir=submission_dir,
            assets_dir=assets_dir,
            output_dir=output_dir,
            context_path=context_path,
            use_sandbox=use_sandbox,
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
            container = _create_sandbox_container(
                client,
                image_name,
                command=[
                    "python",
                    inference_entrypoint,
                    "--submission-dir", submission_dir,
                    "--assets-dir", assets_dir,
                    "--output-dir", generated_dir,
                    "--context", context_path,
                ],
                volumes={volume_name: {"bind": "/app/shared-temp", "mode": "rw"}},
                timeout=timeout,
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
            native_allowed = os.getenv("OLPAI_ALLOW_NATIVE_FINAL", "0") == "1" or cfg.load().native_final_allowed
            if not native_allowed:
                raise RuntimeError(
                    "final inference requires Docker sandbox. For trusted GPU containers, "
                    "enable trusted native final inference during setup."
                )
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

    def _run_judge(
        self,
        *,
        judge: str,
        submission_dir: str,
        assets_dir: str,
        output_dir: str,
        context_path: str,
        use_sandbox: bool = False,
    ) -> dict:
        os.makedirs(output_dir, exist_ok=True)

        if use_sandbox and _docker_available():
            return self._run_judge_sandboxed(
                judge=judge,
                submission_dir=submission_dir,
                assets_dir=assets_dir,
                output_dir=output_dir,
                context_path=context_path,
            )

        p = subprocess.run(
            [
                "python", judge,
                "--submission-dir", submission_dir,
                "--assets-dir", assets_dir,
                "--output-dir", output_dir,
                "--context", context_path,
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

    def _run_judge_sandboxed(
        self,
        *,
        judge: str,
        submission_dir: str,
        assets_dir: str,
        output_dir: str,
        context_path: str,
    ) -> dict:
        """Run judge.py inside a Docker sandbox with resource limits."""
        import docker
        client = docker.from_env()
        timeout = int(os.getenv("SANDBOX_TIMEOUT_S", "300"))
        image_name = "python:3.11-slim"

        try:
            client.images.get(image_name)
        except docker.errors.ImageNotFound:
            client.images.pull("python", tag="3.11-slim")

        # Write result to a temp file shared via volume
        with tempfile.TemporaryDirectory() as host_out:
            container = _create_sandbox_container(
                client,
                image_name,
                command=[
                    "python", judge,
                    "--submission-dir", submission_dir,
                    "--assets-dir", assets_dir,
                    "--output-dir", output_dir,
                    "--context", context_path,
                ],
                volumes={
                    submission_dir: {"bind": submission_dir, "mode": "ro"},
                    assets_dir: {"bind": assets_dir, "mode": "ro"},
                    output_dir: {"bind": output_dir, "mode": "rw"},
                    host_out: {"bind": host_out, "mode": "rw"},
                },
                timeout=timeout,
            )
            container.start()
            try:
                result = container.wait(timeout=timeout)
                exit_code = result.get("StatusCode", 0)
                logs = container.logs().decode("utf-8")
                if exit_code != 0:
                    raise RuntimeError(f"Judge sandbox failed (exit {exit_code}): {logs}")
                # Parse stdout from logs (last non-empty line)
                lines = [l for l in logs.strip().splitlines() if l.strip()]
                if not lines:
                    raise RuntimeError("Judge produced no output")
                out = json.loads(lines[-1])
            except Exception as e:
                try:
                    container.kill()
                except Exception:
                    pass
                raise RuntimeError(f"Judge sandbox error: {str(e)}") from e
            finally:
                try:
                    container.remove(force=True)
                except Exception:
                    pass

        if out.get("status") != "success":
            raise RuntimeError(out.get("message") or "judge failed")
        return out

    def payload_json(self, payload: dict | None) -> str | None:
        if payload is None:
            return None
        return json.dumps(payload)
