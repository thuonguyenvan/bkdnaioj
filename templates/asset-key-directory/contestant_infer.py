#!/usr/bin/env python3
from __future__ import annotations

import argparse
import csv
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--submission-dir", required=True)
    parser.add_argument("--assets-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--context", required=True)
    parser.add_argument("--profile", action="store_true")
    return parser.parse_args()


def find_one(root: Path, patterns: tuple[str, ...]) -> Path:
    for pattern in patterns:
        matches = sorted(root.glob(pattern))
        if matches:
            return matches[0]
    raise FileNotFoundError(f"no file matching {patterns} in {root}")


def load_inputs(inputs_dir: Path) -> list[dict[str, str]]:
    csv_path = find_one(inputs_dir, ("*.csv", "*.tsv"))
    delimiter = "\t" if csv_path.suffix == ".tsv" else ","
    with csv_path.open(newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh, delimiter=delimiter))


def predict(row: dict[str, str]) -> str:
    # Replace this with the contestant's model/algorithm.
    return "0"


def main() -> None:
    args = parse_args()
    assets_dir = Path(args.assets_dir)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    inputs_dir = assets_dir / "inputs"
    rows = load_inputs(inputs_dir)

    if args.profile:
        rows = rows[: min(len(rows), 100)]

    prediction_path = output_dir / "predictions.csv"
    with prediction_path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=["id", "prediction"])
        writer.writeheader()
        for index, row in enumerate(rows):
            sample_id = row.get("id") or str(index)
            writer.writerow({"id": sample_id, "prediction": predict(row)})


if __name__ == "__main__":
    main()

