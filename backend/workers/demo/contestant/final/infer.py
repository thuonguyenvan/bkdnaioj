import argparse
import csv
import os


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--model", required=True)
    args = ap.parse_args()

    os.makedirs(args.output, exist_ok=True)

    # Dummy model: a single threshold stored in model.txt
    with open(args.model, "r", encoding="utf-8") as f:
        threshold = float(f.read().strip())

    in_path = os.path.join(args.input, "public_inputs.csv")
    out_path = os.path.join(args.output, "predictions.csv")

    with open(in_path, newline="") as fin, open(out_path, "w", newline="") as fout:
        r = csv.DictReader(fin)
        w = csv.DictWriter(fout, fieldnames=["id", "y_pred"])
        w.writeheader()
        for row in r:
            x = float(row["x"])
            y_pred = 1 if x >= threshold else 0
            w.writerow({"id": row["id"], "y_pred": y_pred})


if __name__ == "__main__":
    main()
