from __future__ import annotations
from dataclasses import dataclass, field

import httpx


def _raise_for_status(response: httpx.Response) -> None:
    try:
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        body = response.text[:1000]
        raise RuntimeError(
            f"{exc.response.status_code} {exc.response.reason_phrase} for {exc.request.url}: {body}"
        ) from exc


@dataclass
class Artifact:
    type: str
    key: str
    original_filename: str
    url: str


@dataclass
class Job:
    submission_id: str
    attempt_id: str
    task_id: str
    phase_id: str
    is_final: bool
    judge_key: str
    context: dict
    artifacts: list[Artifact]
    timeout_secs: int


class APIClient:
    def __init__(self, api_url: str, token: str) -> None:
        self._base = api_url.rstrip("/")
        self._headers = {"X-Worker-Token": token}

    def register(self, display_name: str, capabilities: dict, max_workers: int = 1) -> dict:
        r = httpx.post(
            f"{self._base}/api/v1/worker/register",
            json={"display_name": display_name, "capabilities": capabilities,
                  "max_workers": max_workers},
            timeout=10,
        )
        _raise_for_status(r)
        return r.json()

    def heartbeat(self, cpu: int, ram: int) -> None:
        r = httpx.post(
            f"{self._base}/api/v1/worker/heartbeat",
            json={"cpu_usage": cpu, "ram_usage": ram},
            headers=self._headers,
            timeout=10,
        )
        _raise_for_status(r)

    def next_job(self) -> Job | None:
        r = httpx.post(
            f"{self._base}/api/v1/worker/jobs/claim-next",
            headers=self._headers,
            timeout=20,
        )
        _raise_for_status(r)
        data = r.json()
        if not data.get("submission_id"):
            return None
        return Job(
            submission_id=data["submission_id"],
            attempt_id=data["attempt_id"],
            task_id=data["task_id"],
            phase_id=data["phase_id"],
            is_final=data.get("is_final", False),
            judge_key=data.get("judge_key", "judge.py"),
            context=data.get("context") or {},
            artifacts=[
                Artifact(
                    type=a["type"],
                    key=a["key"],
                    original_filename=a["original_filename"],
                    url=a["url"],
                )
                for a in (data.get("artifacts") or [])
            ],
            timeout_secs=data.get("timeout_secs", 600),
        )

    def job_heartbeat(self, submission_id: str, attempt_id: str) -> None:
        r = httpx.post(
            f"{self._base}/api/v1/worker/jobs/{submission_id}/heartbeat",
            json={"attempt_id": attempt_id},
            headers=self._headers,
            timeout=10,
        )
        _raise_for_status(r)

    def submit_result(self, submission_id: str, result: dict) -> None:
        r = httpx.post(
            f"{self._base}/api/v1/worker/jobs/{submission_id}/result",
            json=result,
            headers=self._headers,
            timeout=15,
        )
        _raise_for_status(r)
