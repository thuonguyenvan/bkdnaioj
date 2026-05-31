from __future__ import annotations

import sys
import tempfile
import threading
import time

import structlog

from .capabilities import collect, get_resource_usage
from .client import APIClient
from .config import Settings
from .logging import configure_logging
from .runner import PhaseRunner
from .worker_judge import VolunteerJudgeWorker

log = structlog.get_logger()


def main() -> None:
    s = Settings()
    configure_logging()

    client = APIClient(s.api_url, s.worker_token)

    # First boot: no token → register and prompt admin
    if not s.worker_token:
        caps = collect()
        try:
            result = client.register(s.worker_name, caps)
        except Exception as e:
            print(f"Registration failed: {e}", file=sys.stderr)
            sys.exit(1)
        print(f"\nRegistered successfully!")
        print(f"  Worker ID   : {result.get('id')}")
        print(f"  Display name: {result.get('display_name')}")
        print(f"  Status      : {result.get('status')}")
        print(f"\nAsk the admin to approve your worker on the platform.")
        print(f"Once approved, set WORKER_TOKEN=<token> and restart.\n")
        return

    log.info("volunteer_agent_starting", api_url=s.api_url, worker_name=s.worker_name)

    judge_worker = VolunteerJudgeWorker(PhaseRunner())

    def heartbeat_loop() -> None:
        while True:
            try:
                cpu, ram = get_resource_usage()
                client.heartbeat(cpu, ram)
            except Exception as e:
                log.warning("heartbeat_failed", error=str(e))
            time.sleep(s.heartbeat_interval_s)

    threading.Thread(target=heartbeat_loop, daemon=True).start()

    while True:
        try:
            job = client.next_job()
            if job is None:
                time.sleep(s.poll_interval_s)
                continue

            log.info("job_received", submission_id=job.submission_id, is_final=job.is_final)
            with tempfile.TemporaryDirectory(
                prefix=f"olpai-vol-{job.submission_id[:8]}-",
                dir=s.temp_dir,
            ) as td:
                try:
                    result = judge_worker.run(job, td)
                    client.submit_result(job.submission_id, {
                        "status":        "done",
                        "raw_score":     result["raw_score"],
                        "display_score": result["display_score"],
                        "payload":       result.get("payload"),
                    })
                    log.info("job_done", submission_id=job.submission_id, score=result["raw_score"])
                except Exception as exc:
                    err_msg = str(exc)[:4000]
                    log.error("job_failed", submission_id=job.submission_id, error=err_msg)
                    try:
                        client.submit_result(job.submission_id, {
                            "status":        "failed",
                            "error_message": err_msg,
                        })
                    except Exception as e2:
                        log.error("submit_result_failed", error=str(e2))

        except KeyboardInterrupt:
            log.info("shutting_down")
            break
        except Exception as exc:
            log.error("poll_error", error=str(exc))
            time.sleep(s.poll_interval_s)
