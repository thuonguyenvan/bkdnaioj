# Asset Key Directory Contract

Worker exposes every organizer dataset/model asset key as a directory:

```text
assets/
  inputs/
    ...files from inputs.csv or inputs.zip...
  ground_truth/
    ...files from ground_truth.csv or ground_truth.zip...
  model/
    ...files from model.pth or model.zip...
```

Python entrypoint assets such as `judge.py` remain executable files at `assets/judge.py`.

The original uploaded filename is also kept at `assets/<original_filename>` for debugging and backward compatibility.

Contestant code should read public inputs from `assets/inputs/`. Organizer `judge.py` may read hidden labels from `assets/ground_truth/`.

