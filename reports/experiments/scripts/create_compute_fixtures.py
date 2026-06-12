from __future__ import annotations

import argparse
import textwrap
import zipfile
from pathlib import Path

from common import ROOT


INFER_TEMPLATE = r'''
from __future__ import annotations

import argparse
import csv
import os
from pathlib import Path


WORK_UNITS = __WORK_UNITS__
MATRIX_SIZE = __MATRIX_SIZE__
FORCE_FAIL = __FORCE_FAIL__


def run_compute() -> str:
    try:
        import torch
    except Exception:
        torch = None

    if torch is not None:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        dtype = torch.float32
        size = MATRIX_SIZE
        x = torch.randn((size, size), dtype=dtype, device=device)
        y = torch.randn((size, size), dtype=dtype, device=device)
        for _ in range(WORK_UNITS):
            x = x @ y
            x = x / (x.abs().mean() + 1e-6)
        if device == "cuda":
            torch.cuda.synchronize()
        return device

    import numpy as np

    size = max(128, MATRIX_SIZE // 2)
    x = np.random.randn(size, size).astype("float32")
    y = np.random.randn(size, size).astype("float32")
    for _ in range(WORK_UNITS):
        x = x @ y
        x = x / (abs(x).mean() + 1e-6)
    return "numpy-cpu"


def find_ground_truth(assets_dir: Path) -> Path:
    candidates = [
        assets_dir / "ground_truth" / "ground_truth.csv",
        assets_dir / "ground_truth.csv",
    ]
    for path in candidates:
        if path.exists():
            return path
    for path in assets_dir.rglob("ground_truth.csv"):
        return path
    raise FileNotFoundError(f"ground_truth.csv not found under {{assets_dir}}")


def write_predictions(ground_truth: Path, output_dir: Path) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    out_path = output_dir / "predictions.csv"
    with ground_truth.open("r", encoding="utf-8", newline="") as src:
        reader = csv.DictReader(src)
        if not reader.fieldnames or "id" not in reader.fieldnames:
            raise RuntimeError("ground_truth.csv must contain id column")
        label_col = "label" if "label" in reader.fieldnames else "true_label"
        if label_col not in reader.fieldnames:
            raise RuntimeError("ground_truth.csv must contain label or true_label column")
        with out_path.open("w", encoding="utf-8", newline="") as dst:
            writer = csv.DictWriter(dst, fieldnames=["id", "label"])
            writer.writeheader()
            for row in reader:
                writer.writerow({"id": row["id"], "label": row[label_col]})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--submission-dir", required=True)
    parser.add_argument("--assets-dir", required=True)
    parser.add_argument("--output-dir", required=True)
    parser.add_argument("--context", required=False)
    args = parser.parse_args()

    if FORCE_FAIL:
        raise RuntimeError("intentional synthetic final failure")

    execution_path = run_compute()
    ground_truth = find_ground_truth(Path(args.assets_dir))
    write_predictions(ground_truth, Path(args.output_dir))
    (Path(args.output_dir) / "compute_profile.txt").write_text(
        f"execution_path={{execution_path}}\nwork_units={{WORK_UNITS}}\nmatrix_size={{MATRIX_SIZE}}\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
'''


CLASSES = {
    "final-gpu-light": {"work_units": 2, "matrix_size": 1024, "force_fail": False},
    "final-gpu-medium": {"work_units": 8, "matrix_size": 1536, "force_fail": False},
    "final-gpu-heavy": {"work_units": 16, "matrix_size": 2048, "force_fail": False},
    "final-fail": {"work_units": 1, "matrix_size": 512, "force_fail": True},
}


def write_zip(out_dir: Path, label: str, spec: dict) -> Path:
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"{label}.zip"
    infer = (
        textwrap.dedent(INFER_TEMPLATE)
        .replace("__WORK_UNITS__", str(spec["work_units"]))
        .replace("__MATRIX_SIZE__", str(spec["matrix_size"]))
        .replace("__FORCE_FAIL__", "True" if spec["force_fail"] else "False")
        .lstrip()
    )
    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("infer.py", infer)
        zf.writestr("README.txt", f"BKDNAIOJ Chapter 5 synthetic compute fixture: {label}\n")
    return out_path


def main() -> None:
    parser = argparse.ArgumentParser(description="Create final-phase synthetic compute submissions")
    parser.add_argument("--out-dir", default=str(ROOT / "fixtures" / "compute"))
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    for label, spec in CLASSES.items():
        path = write_zip(out_dir, label, spec)
        print(f"{label}: {path}")


if __name__ == "__main__":
    main()
