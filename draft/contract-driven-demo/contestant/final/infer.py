from __future__ import annotations

import argparse
import json
import os


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--submission-dir", required=True)
    parser.add_argument("--assets-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--context", required=True)
    args = parser.parse_args()

    with open(os.path.join(args.assets_dir, "inputs"), "r", encoding="utf-8") as fh:
        inputs = json.load(fh)

    out_dir = os.path.join(args.output_dir, "adversarial_images")
    os.makedirs(out_dir, exist_ok=True)

    for case in inputs["cases"]:
        with open(os.path.join(out_dir, f"{case['id']}.png"), "w", encoding="utf-8") as fh:
            fh.write(f"generated fake image for {case['id']} with marker attack-{case['input_token']}\n")

    with open(os.path.join(args.output_dir, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump({"generated_by": "demo infer.py", "dataset": inputs["dataset"]}, fh)


if __name__ == "__main__":
    main()
