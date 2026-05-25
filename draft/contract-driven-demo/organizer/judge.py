from __future__ import annotations

import argparse
import json
import os
import zipfile


def load_ground_truth(assets_dir: str) -> dict:
    with open(os.path.join(assets_dir, "ground_truth"), "r", encoding="utf-8") as fh:
        return json.load(fh)


def read_submission_file(submission_dir: str, relative_path: str) -> str | None:
    direct_path = os.path.join(submission_dir, relative_path)
    if os.path.exists(direct_path):
        with open(direct_path, "r", encoding="utf-8") as fh:
            return fh.read()

    for name in os.listdir(submission_dir):
        path = os.path.join(submission_dir, name)
        if zipfile.is_zipfile(path):
            with zipfile.ZipFile(path) as zf:
                try:
                    return zf.read(relative_path).decode("utf-8")
                except KeyError:
                    continue
    return None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--submission-dir", required=True)
    parser.add_argument("--assets-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--context", required=True)
    args = parser.parse_args()

    gt = load_ground_truth(args.assets_dir)
    total = len(gt["cases"])
    matched = 0
    missing = []

    for case in gt["cases"]:
        rel = f"adversarial_images/{case['id']}.png"
        content = read_submission_file(args.submission_dir, rel)
        if content is None:
            missing.append(rel)
            continue
        if case["expected_marker"] in content:
            matched += 1

    score = matched / total if total else 0.0
    print(json.dumps({
        "status": "success",
        "raw_score": score,
        "display_score": round(score * 100, 4),
            "payload": {
            "dataset": gt["dataset"],
            "matched": matched,
            "total": total,
            "missing": missing
        }
    }))


if __name__ == "__main__":
    main()
