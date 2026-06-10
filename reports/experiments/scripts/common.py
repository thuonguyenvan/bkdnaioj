from __future__ import annotations

import csv
import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Mapping, Sequence

import httpx
import psycopg
from psycopg.rows import dict_row


ROOT = Path(__file__).resolve().parents[1]
RESULTS_DIR = ROOT / "results"
FIGURES_DIR = ROOT / "figures"
MANIFESTS_DIR = ROOT / "manifests"


@dataclass(frozen=True)
class Settings:
    database_url: str
    api_base_url: str
    metrics_url: str
    admin_email: str | None
    admin_password: str | None


def settings() -> Settings:
    api = os.getenv("API_BASE_URL", "https://api.bkdnaioj.app").rstrip("/")
    return Settings(
        database_url=os.environ["DATABASE_URL"],
        api_base_url=api,
        metrics_url=os.getenv("METRICS_URL", f"{api}/metrics"),
        admin_email=os.getenv("ADMIN_EMAIL"),
        admin_password=os.getenv("ADMIN_PASSWORD"),
    )


def connect():
    return psycopg.connect(
        settings().database_url,
        row_factory=dict_row,
        prepare_threshold=None,
    )


def admin_token() -> str:
    s = settings()
    token = os.getenv("ADMIN_TOKEN")
    if token:
        return token
    if not s.admin_email or not s.admin_password:
        raise RuntimeError("set ADMIN_TOKEN or ADMIN_EMAIL/ADMIN_PASSWORD")
    with httpx.Client(timeout=30) as client:
        response = client.post(
            f"{s.api_base_url}/api/v1/auth/login",
            json={"email": s.admin_email, "password": s.admin_password},
        )
        response.raise_for_status()
        body = response.json()
        token_body = body.get("token") or body
        access = token_body.get("access_token")
        if not access:
            raise RuntimeError(f"login response missing access_token: {body}")
        return access


def auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def ensure_dirs() -> None:
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    MANIFESTS_DIR.mkdir(parents=True, exist_ok=True)


def write_csv(path: Path, rows: Sequence[Mapping[str, object]]) -> None:
    ensure_dirs()
    if not rows:
        path.write_text("", encoding="utf-8")
        return
    columns = list(rows[0].keys())
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns)
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key) for key in columns})


def write_markdown_table(path: Path, rows: Sequence[Mapping[str, object]], title: str | None = None) -> None:
    ensure_dirs()
    if not rows:
        path.write_text((f"## {title}\n\n" if title else "") + "_No data._\n", encoding="utf-8")
        return
    columns = list(rows[0].keys())
    lines: list[str] = []
    if title:
        lines.extend([f"## {title}", ""])
    lines.append("| " + " | ".join(columns) + " |")
    lines.append("| " + " | ".join("---" for _ in columns) + " |")
    for row in rows:
        lines.append("| " + " | ".join(_fmt(row.get(col)) for col in columns) + " |")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def load_json(path: str | Path) -> dict:
    with Path(path).open("r", encoding="utf-8") as handle:
        return json.load(handle)


def _fmt(value: object) -> str:
    if value is None:
        return "-"
    if isinstance(value, float):
        return f"{value:.3f}"
    text = str(value)
    return text.replace("|", "\\|").replace("\n", " ")


def percentile(values: Iterable[float], q: float) -> float | None:
    xs = sorted(v for v in values if v is not None)
    if not xs:
        return None
    if len(xs) == 1:
        return xs[0]
    pos = (len(xs) - 1) * q
    lo = int(pos)
    hi = min(lo + 1, len(xs) - 1)
    frac = pos - lo
    return xs[lo] * (1 - frac) + xs[hi] * frac
