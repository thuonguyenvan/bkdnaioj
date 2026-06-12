from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from common import MANIFESTS_DIR, load_json


REAL_FIXTURES = {
    ("task1", "public_test"): "task1/public_test_predictions.csv",
    ("task1", "private_test"): "task1/private_test_predictions.csv",
    ("task1", "final_public"): "task1/final_public_submission.zip",
    ("task1", "final_private"): "task1/final_private_submission.zip",
    ("task2", "public_test"): "task2/public_test_adversarial.zip",
    ("task2", "private_test"): "task2/private_test_adversarial.zip",
    ("task2", "final_public"): "task2/final_public_submission.zip",
    ("task2", "final_private"): "task2/final_private_submission.zip",
}


COMPUTE_CLASSES = {
    "final-gpu-light": "final-gpu-light.zip",
    "final-gpu-medium": "final-gpu-medium.zip",
    "final-gpu-heavy": "final-gpu-heavy.zip",
    "final-fail": "final-fail.zip",
}


def task_aliases(tasks: list[dict]) -> dict[str, dict]:
    ordered = sorted(tasks, key=lambda row: row.get("slug", ""))
    aliases: dict[str, dict] = {}
    if ordered:
        aliases["task1"] = ordered[0]
    if len(ordered) > 1:
        aliases["task2"] = ordered[1]
    for task in tasks:
        slug = task.get("slug", "")
        aliases[slug] = task
        if "mnist" in slug.lower() or "classification" in slug.lower():
            aliases["classification"] = task
        if "attack" in slug.lower() or "adversarial" in slug.lower():
            aliases["adversarial"] = task
    return aliases


def phase_map(phases: list[dict]) -> dict[tuple[str, str], dict]:
    out = {}
    for phase in phases:
        out[(phase["task_slug"], phase["phase_key"])] = phase
    return out


def real_jobs(exp: dict, fixture_root: Path) -> list[dict]:
    aliases = task_aliases(exp["tasks"])
    phases = phase_map(exp["phases"])
    jobs = []
    for (task_alias, phase_key), rel_path in REAL_FIXTURES.items():
        task = aliases.get(task_alias)
        if not task:
            continue
        phase = phases.get((task["slug"], phase_key))
        if not phase:
            continue
        path = fixture_root / rel_path
        if not path.exists():
            raise FileNotFoundError(f"fixture missing: {path}")
        jobs.append({
            "label": f"{task_alias}-{phase_key}",
            "task_id": task["new_id"],
            "phase_id": phase["new_id"],
            "file": str(path),
            "filename": path.name,
            "content_type": "application/zip" if path.suffix == ".zip" else "text/csv",
            "expected_status": "done",
            "is_final": bool(phase["is_final"]),
        })
    if not jobs:
        raise RuntimeError("no real jobs generated; check experiment manifest and fixture root")
    return jobs


def compute_jobs(exp: dict, compute_root: Path, include_fail: bool) -> list[dict]:
    aliases = task_aliases(exp["tasks"])
    task = aliases.get("classification") or aliases.get("task1")
    if not task:
        raise RuntimeError("classification/task1 task not found in experiment manifest")
    phases = phase_map(exp["phases"])
    final_phases = [
        phases[(task["slug"], key)]
        for key in ("final_public", "final_private")
        if (task["slug"], key) in phases
    ]
    if not final_phases:
        raise RuntimeError("no final phases found for classification/task1")
    jobs = []
    for label, filename in COMPUTE_CLASSES.items():
        if label == "final-fail" and not include_fail:
            continue
        path = compute_root / filename
        if not path.exists():
            raise FileNotFoundError(f"compute fixture missing: {path}")
        for phase in final_phases:
            jobs.append({
                "label": f"compute-{label}-{phase['phase_key']}",
                "task_id": task["new_id"],
                "phase_id": phase["new_id"],
                "file": str(path),
                "filename": path.name,
                "content_type": "application/zip",
                "expected_status": "failed" if label == "final-fail" else "done",
                "is_final": True,
                "workload_class": label,
            })
    return jobs


def expand_weighted(jobs: list[dict], count: int, final_ratio: float, seed: int) -> list[dict]:
    final_jobs = [job for job in jobs if job.get("is_final")]
    output_jobs = [job for job in jobs if not job.get("is_final")]
    if not final_jobs or not output_jobs:
        pool = jobs
        final_count = count
    else:
        final_count = int(round(count * final_ratio))
        output_count = count - final_count
        pool = []
        for idx in range(final_count):
            pool.append(final_jobs[idx % len(final_jobs)])
        for idx in range(output_count):
            pool.append(output_jobs[idx % len(output_jobs)])
    if pool is jobs:
        expanded = [jobs[idx % len(jobs)] for idx in range(count)]
    else:
        expanded = pool
    random.Random(seed).shuffle(expanded)
    return [dict(job, repeat=1) for job in expanded]


def main() -> None:
    parser = argparse.ArgumentParser(description="Build run_workload manifest for Chapter 5 batches")
    parser.add_argument("--experiment-manifest", required=True)
    parser.add_argument("--kind", choices=["real", "real-final-heavy", "compute", "compute-final-heavy"], required=True)
    parser.add_argument("--count", type=int, required=True)
    parser.add_argument("--fixture-root", default="/root/ch5-fixtures")
    parser.add_argument("--compute-root", default=str(Path("reports/experiments/fixtures/compute").resolve()))
    parser.add_argument("--out", default="")
    parser.add_argument("--seed", type=int, default=260612)
    parser.add_argument("--include-fail", action="store_true")
    args = parser.parse_args()

    exp = load_json(args.experiment_manifest)
    if args.kind.startswith("real"):
        base_jobs = real_jobs(exp, Path(args.fixture_root))
        final_ratio = 0.8 if args.kind == "real-final-heavy" else 0.5
    else:
        base_jobs = compute_jobs(exp, Path(args.compute_root), args.include_fail)
        final_ratio = 1.0

    jobs = expand_weighted(base_jobs, args.count, final_ratio, args.seed)
    manifest = {
        "name": f"{exp['experiment_slug']}_{args.kind}_{args.count}",
        "base_url": exp.get("base_url", "https://api.bkdnaioj.app"),
        "experiment_slug": exp["experiment_slug"],
        "contest": exp["contest"],
        "users": exp["users"],
        "shuffle_seed": args.seed,
        "jobs": jobs,
    }

    MANIFESTS_DIR.mkdir(parents=True, exist_ok=True)
    out = Path(args.out) if args.out else MANIFESTS_DIR / f"{manifest['name']}.json"
    out.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(out)


if __name__ == "__main__":
    main()
