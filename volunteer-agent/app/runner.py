from __future__ import annotations

import json
import os
import subprocess
import tempfile
import time

from . import config as cfg

DEFAULT_SANDBOX_IMAGE = "olpai-final-runtime:latest"


def _docker_available() -> bool:
    try:
        result = subprocess.run(["docker", "info"], capture_output=True, timeout=5)
        return result.returncode == 0
    except Exception:
        return False


def _sandbox_image(client) -> str:
    import docker

    image_name = os.getenv("OLPAI_SANDBOX_IMAGE") or cfg.load().sandbox_image or DEFAULT_SANDBOX_IMAGE
    try:
        client.images.get(image_name)
    except docker.errors.ImageNotFound as exc:
        raise RuntimeError(
            f"final inference runtime image '{image_name}' is not installed. "
            "Build it from the platform repository with: "
            "docker build -f runtime/Dockerfile -t olpai-final-runtime:latest . "
            "or set OLPAI_SANDBOX_IMAGE to an equivalent prebuilt image."
        ) from exc
    return image_name


def _create_sandbox_container(client, image_name: str, command: list[str], volumes: dict, timeout: int):
    """Create Docker container with full isolation constraints."""
    memory_limit = os.getenv("OLPAI_SANDBOX_MEMORY", "8g")
    cpu_limit = max(1.0, float(os.getenv("OLPAI_SANDBOX_CPUS", "4")))
    pids_limit = max(64, int(os.getenv("OLPAI_SANDBOX_PIDS", "256")))
    return client.containers.create(
        image=image_name,
        command=command,
        volumes=volumes,
        network_mode="none",
        mem_limit=memory_limit,
        nano_cpus=int(cpu_limit * 1_000_000_000),
        pids_limit=pids_limit,
    )


class PhaseRunner:
    def run_non_final(self, *, judge: str, submission_dir: str, assets_dir: str, output_dir: str, context_path: str) -> dict:
        use_sandbox = os.getenv("JUDGE_SANDBOX", "0") == "1"
        started = time.perf_counter()
        result = self._run_judge(
            judge=judge,
            submission_dir=submission_dir,
            assets_dir=assets_dir,
            output_dir=output_dir,
            context_path=context_path,
            use_sandbox=use_sandbox,
        )
        result["runner_timing_profile"] = {
            "judge_seconds": round(time.perf_counter() - started, 6),
            "execution_mode": "judge_sandbox" if use_sandbox and _docker_available() else "native_judge",
        }
        return result

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
        timing_profile = {
            "inference_seconds": 0.0,
            "judge_seconds": 0.0,
            "execution_mode": "",
        }
        is_docker_env = os.path.isdir("/app/shared-temp") and os.path.exists("/var/run/docker.sock")
        if is_docker_env:
            inference_started = time.perf_counter()
            import docker
            client = docker.from_env()
            timeout = int(os.getenv("SANDBOX_TIMEOUT_S", "300"))
            image_name = _sandbox_image(client)
            timing_profile["execution_mode"] = "docker_sandbox"

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
            timing_profile["inference_seconds"] = round(time.perf_counter() - inference_started, 6)
        else:
            native_allowed = os.getenv("OLPAI_ALLOW_NATIVE_FINAL", "0") == "1" or cfg.load().native_final_allowed
            if not native_allowed:
                raise RuntimeError(
                    "final inference requires Docker sandbox. For trusted GPU containers, "
                    "enable trusted native final inference during setup."
                )
            inference_started = time.perf_counter()
            timing_profile["execution_mode"] = "trusted_native"
            self._run_command(
                [
                    "python",
                    inference_entrypoint,
                    "--submission-dir", submission_dir,
                    "--assets-dir", assets_dir,
                    "--output-dir", generated_dir,
                    "--context", context_path,
                ],
                timeout=int(os.getenv("SANDBOX_TIMEOUT_S", "300")),
                label="inference",
            )
            timing_profile["inference_seconds"] = round(time.perf_counter() - inference_started, 6)
        judge_started = time.perf_counter()
        result = self._run_judge(
            judge=judge,
            submission_dir=generated_dir,
            assets_dir=assets_dir,
            output_dir=output_dir,
            context_path=context_path,
        )
        timing_profile["judge_seconds"] = round(time.perf_counter() - judge_started, 6)
        result["runner_timing_profile"] = timing_profile
        return result

    def profile_final(
        self,
        *,
        inference_entrypoint: str,
        submission_dir: str,
        assets_dir: str,
        generated_dir: str,
        context_path: str,
        profiling: dict,
    ) -> dict | None:
        if not profiling.get("enabled"):
            return None
        native_allowed = os.getenv("OLPAI_ALLOW_NATIVE_FINAL", "0") == "1" or cfg.load().native_final_allowed
        if not native_allowed:
            return {
                "status": "skipped",
                "reason": "profiling requires trusted native final mode",
            }

        sample_output_dir = os.path.join(generated_dir, "_profile_sample")
        os.makedirs(sample_output_dir, exist_ok=True)
        timeout = int(profiling.get("timeout_s") or os.getenv("OLPAI_PROFILE_TIMEOUT_S", "120"))
        extra_args = profiling.get("args")
        if not isinstance(extra_args, list):
            extra_args = ["--profile"]

        command = [
            "python",
            inference_entrypoint,
            "--submission-dir",
            submission_dir,
            "--assets-dir",
            assets_dir,
            "--output-dir",
            sample_output_dir,
            "--context",
            context_path,
        ] + [str(arg) for arg in extra_args]

        started = time.perf_counter()
        try:
            p = subprocess.run(
                command,
                capture_output=True,
                text=True,
                check=True,
                timeout=timeout,
            )
        except subprocess.TimeoutExpired as exc:
            return {
                "status": "timeout",
                "timeout_s": timeout,
                "runtime_seconds": timeout,
                "message": str(exc)[:1000],
            }
        except subprocess.CalledProcessError as exc:
            return {
                "status": "failed",
                "runtime_seconds": round(time.perf_counter() - started, 3),
                "message": (exc.stderr or exc.stdout or str(exc))[:1000],
            }

        profile = {
            "status": "success",
            "runtime_seconds": round(time.perf_counter() - started, 3),
        }
        stdout = p.stdout.strip()
        if stdout:
            try:
                parsed = json.loads(stdout.splitlines()[-1])
                if isinstance(parsed, dict):
                    profile.update(parsed)
            except Exception:
                profile["stdout_tail"] = stdout[-1000:]
        sample_count = profiling.get("sample_count")
        if sample_count is not None:
            profile["sample_count"] = sample_count
        return profile

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

        p = self._run_command(
            [
                "python", judge,
                "--submission-dir", submission_dir,
                "--assets-dir", assets_dir,
                "--output-dir", output_dir,
                "--context", context_path,
            ],
            timeout=int(os.getenv("SANDBOX_TIMEOUT_S", "300")),
            label="judge",
        )
        try:
            lines = [l for l in (p.stdout or "").splitlines() if l.strip()]
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

    def _run_command(
        self,
        command: list[str],
        *,
        timeout: int,
        label: str,
    ) -> subprocess.CompletedProcess[str]:
        try:
            process = subprocess.run(
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
            raise RuntimeError(
                f"{label} command timed out after {timeout}s{suffix}"
            ) from None

        if process.returncode != 0:
            stderr = (process.stderr or "").strip()
            stdout = (process.stdout or "").strip()
            detail = stderr or stdout or "no output"
            raise RuntimeError(
                f"{label} command failed with exit {process.returncode}: {detail}"
            )
        return process

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
        image_name = _sandbox_image(client)

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
