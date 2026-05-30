import argparse
import csv
import json


def read_map(path, key, value):
    out = {}
    with open(path, newline="") as f:
        r = csv.DictReader(f)
        for row in r:
            out[row[key]] = row[value]
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pred", required=True)
    ap.add_argument("--gt", required=True)
    args = ap.parse_args()

    gt = read_map(args.gt, "id", "y_true")
    pred = read_map(args.pred, "id", "y_pred")

    ids = sorted(gt.keys(), key=lambda s: int(s))
    correct = 0
    total = 0
    for i in ids:
        if i not in pred:
            continue
        total += 1
        if int(pred[i]) == int(gt[i]):
            correct += 1

    acc = correct / total if total else 0.0

    print(
        json.dumps(
            {
                "status": "success",
                "raw_score": acc,
                "display_score": round(acc, 5),
                "payload": {"correct": correct, "total": total},
                "message": "ok",
            }
        )
    )


if __name__ == "__main__":
    main()
