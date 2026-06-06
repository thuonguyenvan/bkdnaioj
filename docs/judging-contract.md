# Judging Contract

This document defines the rules that organizers and contestants must follow so submissions can be judged consistently.

## Directory Layout

Every judge or inference process receives these arguments:

```bash
--submission-dir <path>
--assets-dir <path>
--output-dir <path>
--context <path>
```

Meaning:

- `submission-dir`: files uploaded by the contestant.
- `assets-dir`: files uploaded by the organizer for the task/evaluation set.
- `output-dir`: files produced by inference or judge.
- `context`: JSON metadata for the current submission, task, phase, and evaluation set.

## Organizer Asset Rules

Organizer assets are addressed by **asset key**, not by upload filename.

Common asset keys:

- `judge.py`: organizer judge entrypoint.
- `inputs`: public/private input data for contestant inference.
- `ground_truth`: hidden labels or expected answers for judging.
- `model`: optional model/checkpoint/reference assets.

Dataset/model asset keys are always exposed as directories:

```text
assets/
  inputs/
  ground_truth/
  model/
```

If the organizer uploads one file:

```text
upload: inputs.csv, asset key: inputs

assets/
  inputs/
    inputs.csv
  inputs.csv
```

If the organizer uploads a ZIP:

```text
upload: inputs.zip, asset key: inputs

assets/
  inputs/
    id_000.png
    id_001.png
  inputs.zip
```

Python entrypoints remain files:

```text
upload: judge.py, asset key: judge.py

assets/
  judge.py
```

## Contestant Rules

Contestants should read only public input assets, usually:

```text
assets/inputs/
```

Contestants must not read:

```text
assets/ground_truth/
```

Final submissions must include the configured inference entrypoint, usually:

```text
infer.py
```

The inference script must write prediction files to:

```text
--output-dir
```

Example:

```text
output/
  predictions.csv
```

Do not write results into `submission-dir` or `assets-dir`.

## Inference Entrypoint

Default command:

```bash
python infer.py \
  --submission-dir <submission-dir> \
  --assets-dir <assets-dir> \
  --output-dir <output-dir> \
  --context <context>
```

Recommended input paths:

```python
from pathlib import Path

assets_dir = Path(args.assets_dir)
inputs_dir = assets_dir / "inputs"
```

For CSV input:

```python
csv_path = inputs_dir / "inputs.csv"
```

For image input:

```python
for image_path in sorted(inputs_dir.glob("*.png")):
    ...
```

## Optional Profiling

If enabled by the task schema, the worker may call:

```bash
python infer.py ... --profile
```

In profile mode, contestants should run only a small sample and write the same output format as normal inference.

The script may print one JSON object to stdout:

```json
{
  "sample_count": 100,
  "runtime_seconds": 12.4,
  "execution_path": "gpu"
}
```

Profiling is optional. If the task does not enable profiling, this mode is not used.

## Organizer Judge Rules

The judge reads contestant predictions from:

```text
--submission-dir
```

For final phases, `submission-dir` is the generated output from `infer.py`.

The judge may read hidden truth from:

```text
assets/ground_truth/
```

The judge must print exactly one JSON object to stdout:

```json
{
  "status": "success",
  "raw_score": 0.95,
  "display_score": 95,
  "payload": {
    "metric": "accuracy"
  }
}
```

Rules:

- `status` must be `"success"` for accepted judge output.
- `raw_score` is the unscaled score stored by the system.
- `display_score` is the user-facing score for the submission detail page.
- Extra details should go inside `payload`.

For judge failure, raise an exception or print:

```json
{
  "status": "error",
  "message": "explanation"
}
```

## Submission Types

Non-final phase:

- Contestant uploads output artifacts directly.
- Judge reads those files from `submission-dir`.
- No `infer.py` is required.

Final phase:

- Contestant uploads code/checkpoint archive.
- Worker extracts the archive.
- Worker runs `infer.py`.
- Judge scores generated files from `output-dir`.

## ZIP Rules

ZIP files must be safe to extract.

Forbidden:

```text
../secret.txt
/absolute/path/file.txt
```

Recommended:

```text
inputs.zip
  id_000.png
  id_001.png
```

or:

```text
inputs.zip
  images/id_000.png
  images/id_001.png
```

The problem statement must document the expected internal layout.

## Practical Checklist

Organizer:

- Upload `judge.py` with asset key `judge.py`.
- Upload input data with asset key `inputs`.
- Upload labels/answers with asset key `ground_truth`.
- Document the file layout inside `assets/inputs/`.
- Make `judge.py` output valid JSON.

Contestant:

- Read input from `assets/inputs/`.
- Write predictions to `output-dir`.
- Do not read `ground_truth`.
- For final phases, include `infer.py` at the root of the submitted ZIP unless the task schema says otherwise.
- Keep output filenames and columns exactly as required by the problem statement.

