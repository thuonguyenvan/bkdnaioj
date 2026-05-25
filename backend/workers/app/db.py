from __future__ import annotations

from dataclasses import dataclass

import psycopg


@dataclass(frozen=True)
class Submission:
    id: str
    contest_id: str
    contest_entry_id: str
    task_id: str
    phase_id: str
    judge_key: str
    contest_phase_def_id: str
    evaluation_set_id: str
    is_final: bool
    submission_schema: str


@dataclass(frozen=True)
class SubmissionFile:
    original_filename: str
    storage_path: str


@dataclass(frozen=True)
class EvaluationSetAsset:
    asset_key: str
    original_filename: str
    storage_path: str


class DB:
    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    def connect(self) -> psycopg.Connection:
        return psycopg.connect(self._dsn)

    def get_submission(self, conn: psycopg.Connection, submission_id: str) -> Submission:
        row = conn.execute(
            """
            SELECT s.id, s.contest_id, s.contest_entry_id, s.task_id, s.phase_id,
                   p.judge_key, p.contest_phase_def_id, p.evaluation_set_id, p.is_final,
                   t.submission_schema::text
            FROM submissions s
            JOIN phases p ON p.id = s.phase_id
            JOIN tasks t ON t.id = s.task_id
            WHERE s.id = %s
            """,
            (submission_id,),
        ).fetchone()
        if row is None:
            raise RuntimeError("submission not found")
        return Submission(
            id=str(row[0]),
            contest_id=str(row[1]),
            contest_entry_id=str(row[2]),
            task_id=str(row[3]),
            phase_id=str(row[4]),
            judge_key=str(row[5]),
            contest_phase_def_id=str(row[6]),
            evaluation_set_id=str(row[7]),
            is_final=bool(row[8]),
            submission_schema=str(row[9] or "{}"),
        )

    def list_submission_files(self, conn: psycopg.Connection, submission_id: str) -> list[SubmissionFile]:
        rows = conn.execute(
            """
            SELECT original_filename, storage_path
            FROM submission_files
            WHERE submission_id = %s
            ORDER BY created_at
            """,
            (submission_id,),
        ).fetchall()
        return [SubmissionFile(original_filename=str(r[0]), storage_path=str(r[1])) for r in rows]

    def list_evaluation_set_assets(self, conn: psycopg.Connection, evaluation_set_id: str) -> list[EvaluationSetAsset]:
        rows = conn.execute(
            """
            SELECT asset_key, original_filename, storage_path
            FROM evaluation_set_assets
            WHERE evaluation_set_id = %s
            ORDER BY asset_key
            """,
            (evaluation_set_id,),
        ).fetchall()
        return [EvaluationSetAsset(asset_key=str(r[0]), original_filename=str(r[1]), storage_path=str(r[2])) for r in rows]

    def list_task_assets(self, conn: psycopg.Connection, task_id: str) -> list[EvaluationSetAsset]:
        rows = conn.execute(
            """
            SELECT asset_key, original_filename, storage_path
            FROM task_assets
            WHERE task_id = %s
            ORDER BY asset_key
            """,
            (task_id,),
        ).fetchall()
        return [EvaluationSetAsset(asset_key=str(r[0]), original_filename=str(r[1]), storage_path=str(r[2])) for r in rows]

    def mark_running(self, conn: psycopg.Connection, submission_id: str) -> None:
        conn.execute(
            "UPDATE submissions SET status='running', updated_at=now() WHERE id=%s",
            (submission_id,),
        )

    def mark_failed(self, conn: psycopg.Connection, submission_id: str, error_message: str) -> None:
        conn.execute(
            "UPDATE submissions SET status='failed', error_message=%s, updated_at=now() WHERE id=%s",
            (error_message[:4000], submission_id),
        )

    def mark_done(
        self,
        conn: psycopg.Connection,
        submission_id: str,
        raw_score: float,
        display_score: float,
        score_payload_json: str | None,
    ) -> None:
        conn.execute(
            """
            UPDATE submissions
            SET status='done', raw_score=%s, display_score=%s, score_payload=%s::jsonb,
                evaluated_at=now(), updated_at=now(), error_message=NULL
            WHERE id=%s
            """,
            (raw_score, display_score, score_payload_json, submission_id),
        )
