# Contract-Driven Judging Demo

Demo này dùng để test luồng nộp/chấm không hardcode `predictions.csv`.

## 1. Tạo task

Khi BTC tạo task, copy nội dung trong:

```text
organizer/task_submission_schema.json
```

vào field `submission_schema`.

Hoặc dùng payload đầy đủ:

```text
organizer/create_task_payload.json
```

Schema này mô tả:

- Non-final phases nhận output artifact đã sinh sẵn.
- Final phases nhận checkpoint/code inference.
- Task cần BTC upload asset key `judge.py` một lần.
- Mỗi evaluation set public/private cần BTC upload asset key `ground_truth` và `inputs`.

## 2. Upload assets của BTC

Ở cấp task, upload:

```text
organizer/judge.py                 asset_key: judge.py
```

Với public evaluation set, upload:

```text
organizer/public/ground_truth.json asset_key: ground_truth
organizer/public/inputs.json       asset_key: inputs
```

Với private evaluation set, upload:

```text
organizer/private/ground_truth.json asset_key: ground_truth
organizer/private/inputs.json       asset_key: inputs
```

Trong demo này file cụ thể là JSON cho dễ đọc, nhưng asset key trên hệ thống là `inputs` và `ground_truth`. Contest thật có thể dùng CSV, ZIP ảnh, parquet, folder dữ liệu, hoặc format bất kỳ mà `infer.py`/`judge.py` biết đọc.

`inputs` là data input để final inference chạy. `ground_truth` là đáp án/nhãn ẩn để `judge.py` chấm. `judge.py` đọc artifact từ `--submission-dir`, đọc ground truth từ `--assets-dir`, và trả JSON score ra stdout.

## 3. Thí sinh nộp non-final

Upload file:

```text
contestant/non_final_submission.zip
```

Cho private test, upload file tương ứng:

```text
contestant/non_final_private_submission.zip
```

File này chứa output đã sinh sẵn:

```text
adversarial_images/
  img_001.png
  img_002.png
  img_003.png
manifest.json
```

Ở non-final, thí sinh đã tự chạy model/inference bên ngoài hệ thống để tạo output artifact này.

Worker sẽ không cần biết đây là ảnh hay CSV. Judge tự mở ZIP và chấm.

## 4. Thí sinh nộp final

Upload file:

```text
contestant/final_submission.zip
```

File này chứa checkpoint/code inference:

```text
infer.py
checkpoint.txt
config.json
```

Worker extract ZIP, chạy `infer.py` với `--assets-dir` chứa asset `inputs`, sinh output trong `generated/`, rồi gọi `judge.py` để chấm output đó bằng asset `ground_truth`.

## 5. Kết quả kỳ vọng

Với public set:

- non-final sample đạt `display_score = 100`
- final sample đạt `display_score = 100`

Với private set:

- `non_final_private_submission.zip` đạt `display_score = 100`
- `final_submission.zip` cũng đạt `display_score = 100` vì `infer.py` đọc `reference.json` của evaluation set hiện tại.
