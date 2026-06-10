from __future__ import annotations

import argparse
import json
from datetime import datetime, timedelta, timezone

from common import MANIFESTS_DIR, connect, ensure_dirs


def clone_contest(
    source_contest: str,
    slug: str,
    title: str,
    clone_entries: bool,
    test_users: int,
    test_password: str,
) -> dict:
    start = datetime.now(timezone.utc) - timedelta(minutes=10)
    end = datetime.now(timezone.utc) + timedelta(days=14)
    manifest: dict = {
        "experiment_slug": slug,
        "source_contest": source_contest,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "clone_entries": clone_entries,
    }

    with connect() as conn:
        with conn.transaction():
            source = conn.execute(
                """
                SELECT *
                FROM contests
                WHERE id::text = %(source)s OR slug = %(source)s
                """,
                {"source": source_contest},
            ).fetchone()
            if not source:
                raise RuntimeError(f"source contest not found: {source_contest}")

            new_contest = conn.execute(
                """
                INSERT INTO contests (
                    slug, title, description, banner_url, status, entry_policy,
                    registration_start, registration_end, start_time, end_time,
                    visibility, rules_json, created_by, max_team_size, require_approval
                )
                SELECT
                    %(slug)s,
                    %(title)s,
                    COALESCE(description, '') || E'\n\n[Experiment clone for thesis Chapter 5]',
                    banner_url,
                    'running'::contest_status,
                    entry_policy,
                    %(start)s,
                    %(end)s,
                    %(start)s,
                    %(end)s,
                    'private'::contest_visibility,
                    rules_json,
                    created_by,
                    max_team_size,
                    false
                FROM contests
                WHERE id = %(source_id)s
                RETURNING id, slug, title
                """,
                {"source_id": source["id"], "slug": slug, "title": title, "start": start, "end": end},
            ).fetchone()
            manifest["contest"] = dict(new_contest)

            conn.execute("CREATE TEMP TABLE exp_phase_def_map(old_id uuid, new_id uuid) ON COMMIT DROP")
            conn.execute("CREATE TEMP TABLE exp_task_map(old_id uuid, new_id uuid) ON COMMIT DROP")
            conn.execute("CREATE TEMP TABLE exp_eval_set_map(old_id uuid, new_id uuid) ON COMMIT DROP")
            conn.execute("CREATE TEMP TABLE exp_phase_map(old_id uuid, new_id uuid) ON COMMIT DROP")
            conn.execute("CREATE TEMP TABLE exp_entry_map(old_id uuid, new_id uuid) ON COMMIT DROP")

            conn.execute(
                """
                WITH copied AS (
                    INSERT INTO contest_phase_defs (contest_id, key, title, sort_order)
                    SELECT %(new_contest_id)s, key, title, sort_order
                    FROM contest_phase_defs
                    WHERE contest_id = %(source_id)s
                    ORDER BY sort_order
                    RETURNING id, key
                )
                INSERT INTO exp_phase_def_map(old_id, new_id)
                SELECT old.id, copied.id
                FROM contest_phase_defs old
                JOIN copied ON copied.key = old.key
                WHERE old.contest_id = %(source_id)s
                """,
                {"source_id": source["id"], "new_contest_id": new_contest["id"]},
            )

            conn.execute(
                """
                WITH copied AS (
                    INSERT INTO tasks (
                        contest_id, slug, title, description, problem_statement_url,
                        submission_schema, score_label, higher_is_better, sort_order
                    )
                    SELECT
                        %(new_contest_id)s,
                        slug,
                        title,
                        description,
                        problem_statement_url,
                        submission_schema,
                        score_label,
                        higher_is_better,
                        sort_order
                    FROM tasks
                    WHERE contest_id = %(source_id)s
                    ORDER BY sort_order
                    RETURNING id, slug
                )
                INSERT INTO exp_task_map(old_id, new_id)
                SELECT old.id, copied.id
                FROM tasks old
                JOIN copied ON copied.slug = old.slug
                WHERE old.contest_id = %(source_id)s
                """,
                {"source_id": source["id"], "new_contest_id": new_contest["id"]},
            )

            conn.execute(
                """
                WITH copied AS (
                    INSERT INTO task_evaluation_sets (task_id, key, title, description)
                    SELECT tm.new_id, tes.key, tes.title, tes.description
                    FROM task_evaluation_sets tes
                    JOIN exp_task_map tm ON tm.old_id = tes.task_id
                    RETURNING id, task_id, key
                )
                INSERT INTO exp_eval_set_map(old_id, new_id)
                SELECT old.id, copied.id
                FROM task_evaluation_sets old
                JOIN exp_task_map tm ON tm.old_id = old.task_id
                JOIN copied ON copied.task_id = tm.new_id AND copied.key = old.key
                """,
            )

            conn.execute(
                """
                INSERT INTO evaluation_set_assets (
                    evaluation_set_id, asset_key, original_filename, storage_path,
                    file_size, content_type, hash_sha256
                )
                SELECT esm.new_id, asset_key, original_filename, storage_path,
                       file_size, content_type, hash_sha256
                FROM evaluation_set_assets esa
                JOIN exp_eval_set_map esm ON esm.old_id = esa.evaluation_set_id
                """,
            )

            conn.execute(
                """
                INSERT INTO task_assets (
                    task_id, asset_key, original_filename, storage_path,
                    file_size, content_type, hash_sha256
                )
                SELECT tm.new_id, asset_key, original_filename, storage_path,
                       file_size, content_type, hash_sha256
                FROM task_assets ta
                JOIN exp_task_map tm ON tm.old_id = ta.task_id
                """,
            )

            conn.execute(
                """
                WITH copied AS (
                    INSERT INTO phases (
                        task_id, contest_phase_def_id, evaluation_set_id, slug, title,
                        description, open_time, close_time, judge_key, submission_limit,
                        leaderboard_mode, allow_official_submit, allow_virtual_submit,
                        allow_practice_submit, display_scores, is_frozen, is_final, sort_order
                    )
                    SELECT
                        tm.new_id,
                        pdm.new_id,
                        esm.new_id,
                        p.slug,
                        p.title,
                        p.description,
                        %(start)s,
                        %(end)s,
                        p.judge_key,
                        NULL,
                        p.leaderboard_mode,
                        true,
                        true,
                        true,
                        p.display_scores,
                        false,
                        p.is_final,
                        p.sort_order
                    FROM phases p
                    JOIN exp_task_map tm ON tm.old_id = p.task_id
                    JOIN exp_phase_def_map pdm ON pdm.old_id = p.contest_phase_def_id
                    JOIN exp_eval_set_map esm ON esm.old_id = p.evaluation_set_id
                    RETURNING id, task_id, contest_phase_def_id, slug
                )
                INSERT INTO exp_phase_map(old_id, new_id)
                SELECT old.id, copied.id
                FROM phases old
                JOIN exp_task_map tm ON tm.old_id = old.task_id
                JOIN copied ON copied.task_id = tm.new_id AND copied.slug = old.slug
                """,
                {"start": start, "end": end},
            )

            if clone_entries:
                conn.execute(
                    """
                    WITH copied AS (
                        INSERT INTO contest_entries (
                            contest_id, entry_type, entry_mode, user_id, team_id,
                            display_name, status, registered_by, approved_by,
                            approved_at, start_at, end_at
                        )
                        SELECT
                            %(new_contest_id)s,
                            entry_type,
                            entry_mode,
                            user_id,
                            team_id,
                            'exp_ch5_' || display_name,
                            'active'::entry_status,
                            registered_by,
                            approved_by,
                            now(),
                            %(start)s,
                            %(end)s
                        FROM contest_entries
                        WHERE contest_id = %(source_id)s
                          AND status IN ('approved', 'active', 'finished')
                        RETURNING id, user_id, team_id, entry_mode
                    )
                    INSERT INTO exp_entry_map(old_id, new_id)
                    SELECT old.id, copied.id
                    FROM contest_entries old
                    JOIN copied
                      ON copied.entry_mode = old.entry_mode
                     AND copied.user_id IS NOT DISTINCT FROM old.user_id
                     AND copied.team_id IS NOT DISTINCT FROM old.team_id
                    WHERE old.contest_id = %(source_id)s
                    """,
                    {"source_id": source["id"], "new_contest_id": new_contest["id"], "start": start, "end": end},
                )
                conn.execute(
                    """
                    INSERT INTO contest_entry_members (contest_entry_id, user_id, role)
                    SELECT em.new_id, cem.user_id, cem.role
                    FROM contest_entry_members cem
                    JOIN exp_entry_map em ON em.old_id = cem.contest_entry_id
                    ON CONFLICT DO NOTHING
                    """,
                )

            if test_users > 0:
                user_prefix = slug.replace("-", "_")
                created_users = conn.execute(
                    """
                    WITH generated AS (
                        SELECT generate_series(1, %(count)s) AS n
                    )
                    INSERT INTO users (
                        email, password_hash, full_name, role, username
                    )
                    SELECT
                        %(prefix)s || '_' || lpad(n::text, 3, '0') || '@example.invalid',
                        crypt(%(password)s, gen_salt('bf', 12)),
                        'Chapter 5 Experiment User ' || lpad(n::text, 3, '0'),
                        'contestant'::user_role,
                        %(prefix)s || '_' || lpad(n::text, 3, '0')
                    FROM generated
                    RETURNING id, email, username, full_name
                    """,
                    {
                        "count": test_users,
                        "prefix": user_prefix,
                        "password": test_password,
                    },
                ).fetchall()

                manifest["users"] = []
                for user in created_users:
                    entry = conn.execute(
                        """
                        INSERT INTO contest_entries (
                            contest_id, entry_type, entry_mode, user_id,
                            display_name, status, registered_by, approved_by,
                            approved_at, start_at, end_at
                        )
                        VALUES (
                            %(contest_id)s,
                            'individual'::entry_type,
                            'official'::entry_mode,
                            %(user_id)s,
                            %(display_name)s,
                            'active'::entry_status,
                            %(user_id)s,
                            %(user_id)s,
                            now(),
                            %(start)s,
                            %(end)s
                        )
                        RETURNING id
                        """,
                        {
                            "contest_id": new_contest["id"],
                            "user_id": user["id"],
                            "display_name": user["full_name"],
                            "start": start,
                            "end": end,
                        },
                    ).fetchone()
                    conn.execute(
                        """
                        INSERT INTO contest_entry_members (
                            contest_entry_id, user_id, role
                        )
                        VALUES (
                            %(entry_id)s,
                            %(user_id)s,
                            'leader'::entry_member_role
                        )
                        """,
                        {
                            "entry_id": entry["id"],
                            "user_id": user["id"],
                        },
                    )
                    manifest["users"].append({
                        "user_id": str(user["id"]),
                        "email": user["email"],
                        "username": user["username"],
                        "password": test_password,
                        "entry_id": str(entry["id"]),
                    })
            else:
                manifest["users"] = []

            manifest["tasks"] = conn.execute(
                """
                SELECT old.id::text AS old_id, new.id::text AS new_id, new.slug, new.title
                FROM exp_task_map tm
                JOIN tasks old ON old.id = tm.old_id
                JOIN tasks new ON new.id = tm.new_id
                ORDER BY new.sort_order
                """
            ).fetchall()
            manifest["phases"] = conn.execute(
                """
                SELECT old.id::text AS old_id, new.id::text AS new_id, t.slug AS task_slug,
                       cpd.key::text AS phase_key, new.slug, new.is_final
                FROM exp_phase_map pm
                JOIN phases old ON old.id = pm.old_id
                JOIN phases new ON new.id = pm.new_id
                JOIN tasks t ON t.id = new.task_id
                JOIN contest_phase_defs cpd ON cpd.id = new.contest_phase_def_id
                ORDER BY t.sort_order, new.sort_order
                """
            ).fetchall()
            manifest["entries"] = conn.execute(
                """
                SELECT old.id::text AS old_id, new.id::text AS new_id,
                       new.display_name, new.entry_mode::text AS entry_mode
                FROM exp_entry_map em
                JOIN contest_entries old ON old.id = em.old_id
                JOIN contest_entries new ON new.id = em.new_id
                ORDER BY new.display_name
                """
            ).fetchall() if clone_entries else []

    ensure_dirs()
    out = MANIFESTS_DIR / f"{slug}.json"
    out.write_text(json.dumps(manifest, indent=2, default=str), encoding="utf-8")
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Clone a contest for Chapter 5 experiments")
    parser.add_argument("--source-contest", required=True, help="Source contest id or slug")
    parser.add_argument("--slug", required=True, help="New experiment contest slug, e.g. exp_ch5_20260610")
    parser.add_argument("--title", default="BKDNAIOJ Chapter 5 Experiment")
    parser.add_argument("--clone-entries", action="store_true")
    parser.add_argument("--test-users", type=int, default=4)
    parser.add_argument("--test-password", default="ExpCh5-Only-2026")
    args = parser.parse_args()

    if args.test_users < 0:
        parser.error("--test-users must be non-negative")
    if args.test_users > 0 and len(args.test_password) < 8:
        parser.error("--test-password must contain at least 8 characters")

    manifest = clone_contest(
        args.source_contest,
        args.slug,
        args.title,
        args.clone_entries,
        args.test_users,
        args.test_password,
    )
    print(json.dumps(manifest, indent=2, default=str))


if __name__ == "__main__":
    main()
