#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--submission-dir", required=True)
    parser.add_argument("--assets-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--context", required=True)
    return parser.parse_args()


def find_one(root: Path, patterns: tuple[str, ...]) -> Path:
    for pattern in patterns:
        matches = sorted(root.glob(pattern))
        if matches:
            return matches[0]
    raise FileNotFoundError(f"no file matching {patterns} in {root}")


def read_csv(path: Path) -> list[dict[str, str]]:
    with path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def main() -> None:
    args = parse_args()
    submission_dir = Path(args.submission_dir)
    assets_dir = Path(args.assets_dir)

    predictions = read_csv(find_one(submission_dir, ("predictions.csv", "submission.csv")))
    truth = read_csv(find_one(assets_dir / "ground_truth", ("*.csv",)))

    expected = {row["id"]: row for row in truth}
    correct = 0
    total = len(expected)

    for row in predictions:
        sample_id = row.get("id")
        if not sample_id or sample_id not in expected:
            continue
        prediction = row.get("prediction", "")
        answer = expected[sample_id].get("label") or expected[sample_id].get("target") or ""
        if prediction == answer:
            correct += 1

    raw_score = 0.0 if total == 0 else correct / total
    print(json.dumps({
        "status": "success",
        "raw_score": raw_score,
        "display_score": raw_score * 100,
        "payload": {
            "metric": "accuracy",
            "correct": correct,
            "total": total,
        },
    }))


if __name__ == "__main__":
    main()

