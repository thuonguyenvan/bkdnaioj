# Measurement-Driven Capability-Aware Scheduling — Implementation-Oriented Design

## 1. Mục tiêu của bản này

Bản này viết lại ý tưởng scheduling theo hướng **có thể implement được**, tức là nhìn vào có thể hiểu:

- worker benchmark cần đo gì,
- submission/job profile được tạo như thế nào,
- `T(i,j)` được tính ra sao,
- `available_time_i` được tính ra sao,
- `stress(i,j)` được tính ra sao,
- `waste(i,j)` được tính ra sao,
- `cost(i,j)` được so sánh như thế nào,
- các phase có thể **overlap thời gian active** thì scheduler xử lý thế nào.

Mục tiêu quan trọng nhất:

> Không dùng các ngưỡng/hằng số cảm tính kiểu `RAM >= 8GB`, `VRAM >= 8GB`, `official = 100`, `GPU penalty = 30`.

Thay vào đó, hệ thống ra quyết định dựa trên:

- dữ liệu đo được từ volunteer worker,
- dữ liệu đo được hoặc suy ra từ phase/submission,
- timeout/rule thật của phase,
- lịch sử runtime thật,
- công thức có thể giải thích.

---

## 2. Điều chỉnh quan trọng: 4 phase có thể overlap

Trước đó có thể hiểu nhầm rằng các phase luôn mở tuần tự. Thiết kế đúng hơn là:

> Mỗi phase là một sub-contest có `open_time` và `close_time` riêng. Các phase có thể overlap thời gian active.

Ví dụ một contest có thể đang active đồng thời:

```text
public_test
public_final
```

hoặc:

```text
private_test
private_final
```

Do đó scheduler **không giả định phase mở tuần tự**.

Scheduler chỉ cần định nghĩa tập job hợp lệ theo thời gian:

```text
active_jobs(now) =
  { job j | phase_j.open_time <= now <= phase_j.close_time }
```

Nếu nhiều phase overlap, job của tất cả phase đang active đều là candidate.

Rule official-first vẫn độc lập với phase:

```text
if official_contest_active(now):
    candidate_jobs = active official jobs only
else:
    candidate_jobs = active official + virtual + practice jobs
```

Nghĩa là:

- phase có thể overlap,
- official/virtual/practice policy là một lớp filter riêng,
- không cần phase priority weight cảm tính.

---

## 3. Tổng quan thuật toán

Khi một worker request job:

```text
1. Lấy worker profile C_i.
2. Lấy danh sách queued submissions.
3. Lọc theo official-first policy.
4. Lọc theo phase đang active.
5. Với mỗi job còn lại:
   - tạo hoặc đọc job profile D_j,
   - kiểm tra hard constraints,
   - ước lượng runtime T(i,j),
   - tính available_time_i,
   - tính estimated_finish_time(i,j),
   - tính stress(i,j),
   - tính waste(i,j),
   - tạo cost tuple.
6. Chọn job có cost nhỏ nhất theo lexicographic order.
7. Claim job cho worker.
```

---

## 4. Dữ liệu đầu vào

### 4.1 Worker profile

Mỗi volunteer worker khi cài agent sẽ chạy benchmark script.

Worker `i` có profile:

```text
C_i = {
  cpu_ops_per_sec,
  gpu_fp32_ops_per_sec,
  gpu_fp16_ops_per_sec,
  memory_bandwidth_bytes_per_sec,
  disk_read_bytes_per_sec,
  disk_write_bytes_per_sec,
  network_download_bytes_per_sec,
  unzip_bytes_per_sec,
  docker_startup_seconds,
  python_startup_seconds,
  available_ram_bytes,
  available_vram_bytes,
  available_disk_bytes,
  max_parallel_jobs,
  sandbox_passed
}
```

Trong đó:

- `*_ops_per_sec`: throughput compute đo được.
- `*_bytes_per_sec`: throughput I/O đo được.
- `available_*_bytes`: tài nguyên dung lượng hiện có.
- `max_parallel_jobs`: số job tối đa worker có thể chạy song song, có thể bắt đầu bằng 1.
- `sandbox_passed`: worker có chạy sandbox an toàn được không.

### 4.2 Phase profile

Mỗi phase có profile riêng:

```text
P_p = {
  phase_id,
  phase_key,
  submission_mode,       // output_only | model_inference
  dataset_scope,         // public | private
  open_time,
  close_time,
  timeout_seconds,
  dataset_num_samples,
  dataset_size_bytes,
  ground_truth_size_bytes,
  judge_profile,
  inference_profile_optional
}
```

`judge_profile` có thể được tạo bằng cách chạy `judge.py` trên sample nhỏ.

Ví dụ:

```text
judge_profile = {
  sample_rows,
  sample_input_bytes,
  sample_runtime_seconds_on_reference_worker,
  sample_peak_ram_bytes,
  reference_worker_cpu_ops_per_sec
}
```

Từ đó suy ra chi phí judge theo đơn vị input.

### 4.3 Submission/job profile

Mỗi submission/job `j` có profile:

```text
J_j = {
  submission_id,
  phase_id,
  contest_entry_mode,        // official | virtual | practice
  artifact_size_bytes,
  compressed_bytes,
  uncompressed_bytes_optional,
  prediction_rows_optional,
  model_size_bytes_optional,
  framework_optional,
  dry_run_profile_optional,
  created_at
}
```

Với output-only phase:

```text
prediction_rows
prediction_file_size_bytes
```

Với final/inference phase:

```text
artifact_size_bytes
model_size_bytes
framework
dry_run_profile_optional
```

---

## 5. Worker benchmark script cần đo thế nào?

### 5.1 CPU throughput

Đo bằng:

- matrix multiplication FP32,
- NumPy dot product,
- multi-thread workload.

Kết quả:

```text
cpu_ops_per_sec
```

Ví dụ đơn giản:

```text
cpu_ops_per_sec = measured_number_of_float_ops / runtime_seconds
```

### 5.2 GPU throughput

Nếu có GPU:

```text
gpu_fp32_ops_per_sec = measured_fp32_ops / runtime_seconds
gpu_fp16_ops_per_sec = measured_fp16_ops / runtime_seconds
available_vram_bytes = measured_free_vram
```

Nếu không có GPU:

```text
gpu_fp32_ops_per_sec = 0
gpu_fp16_ops_per_sec = 0
available_vram_bytes = 0
```

### 5.3 Memory bandwidth

Đo copy large array:

```text
memory_bandwidth_bytes_per_sec =
  copied_bytes / runtime_seconds
```

### 5.4 Disk throughput

Đo read/write file lớn:

```text
disk_read_bytes_per_sec = read_bytes / read_seconds
disk_write_bytes_per_sec = written_bytes / write_seconds
```

### 5.5 Unzip throughput

Đo giải nén file mẫu:

```text
unzip_bytes_per_sec = compressed_bytes / unzip_seconds
```

### 5.6 Network throughput

Đo download từ MinIO/S3:

```text
network_download_bytes_per_sec =
  downloaded_bytes / download_seconds
```

### 5.7 Sandbox overhead

Đo thời gian start container:

```text
docker_startup_seconds
python_startup_seconds
```

Nếu sandbox không chạy được:

```text
sandbox_passed = false
```

Worker không được nhận job.

---

## 6. Tạo demand vector `D_j` của submission

Với mỗi job `j`, ta tạo demand vector:

```text
D_j = {
  cpu_ops,
  gpu_ops,
  ram_bytes,
  vram_bytes,
  disk_read_bytes,
  disk_write_bytes,
  network_bytes,
  unzip_bytes
}
```

### 6.1 Output-only job

Áp dụng cho:

```text
public_test
private_test
```

Contestant nộp output như:

```text
predictions.csv
```

#### 6.1.1 CPU demand cho judge

Giả sử phase đã có judge profile:

```text
sample_rows = number of rows in sample
sample_runtime_seconds = runtime of judge.py on sample
reference_cpu_ops_per_sec = CPU throughput of reference worker
```

Ta suy ra:

```text
cpu_ops_per_row =
  (sample_runtime_seconds * reference_cpu_ops_per_sec) / sample_rows
```

Nếu submission có `prediction_rows`:

```text
D_j.cpu_ops =
  cpu_ops_per_row * prediction_rows
```

#### 6.1.2 RAM demand cho judge

Nếu sample judge dùng peak RAM:

```text
ram_bytes_per_row =
  sample_peak_ram_bytes / sample_rows
```

Thì:

```text
D_j.ram_bytes =
  max(sample_peak_ram_bytes, ram_bytes_per_row * prediction_rows)
```

Nếu có runtime history thì thay bằng p95 actual memory theo phase/task.

#### 6.1.3 I/O demand

```text
D_j.disk_read_bytes =
  prediction_file_size_bytes
  + ground_truth_size_bytes

D_j.disk_write_bytes =
  expected_log_bytes
  + expected_result_bytes
```

`expected_log_bytes` và `expected_result_bytes` có thể lấy từ lịch sử trung bình của phase. Nếu chưa có thì có thể bỏ qua vì thường rất nhỏ so với input.

#### 6.1.4 Network demand

Nếu worker chưa cache assets:

```text
D_j.network_bytes =
  prediction_file_size_bytes
  + phase_asset_bytes
```

Nếu worker đã cache phase assets:

```text
D_j.network_bytes =
  prediction_file_size_bytes
```

#### 6.1.5 GPU demand

Output-only không cần GPU:

```text
D_j.gpu_ops = 0
D_j.vram_bytes = 0
```

---

### 6.2 Final/model-inference job

Áp dụng cho:

```text
public_final
private_final
```

Contestant nộp:

```text
model.zip
infer.py
checkpoint
```

Demand gồm:

```text
download + unzip + model load + inference + judge
```

#### 6.2.1 Artifact I/O demand

```text
D_j.network_bytes =
  artifact_size_bytes + phase_asset_bytes_if_not_cached

D_j.unzip_bytes =
  compressed_bytes

D_j.disk_read_bytes =
  artifact_size_bytes + dataset_size_bytes + model_size_bytes

D_j.disk_write_bytes =
  uncompressed_submission_bytes + output_prediction_bytes + logs_bytes
```

#### 6.2.2 Inference demand bằng dry-run

Nếu có dry-run trên `n` samples:

```text
dry_run_samples = n
dry_run_runtime_seconds = t
dry_run_peak_ram_bytes = m
dry_run_peak_vram_bytes = v
dry_run_worker_compute_capacity = C_probe
```

Nếu dry-run chạy trên CPU:

```text
cpu_ops_per_sample =
  (t * C_probe.cpu_ops_per_sec) / n

D_j.cpu_ops =
  cpu_ops_per_sample * dataset_num_samples
```

Nếu dry-run chạy trên GPU:

```text
gpu_ops_per_sample =
  (t * C_probe.gpu_ops_per_sec) / n

D_j.gpu_ops =
  gpu_ops_per_sample * dataset_num_samples
```

Memory demand:

```text
D_j.ram_bytes = dry_run_peak_ram_bytes
D_j.vram_bytes = dry_run_peak_vram_bytes
```

Nếu chưa có dry-run, dùng fallback từ history:

```text
D_j = median demand of jobs with same phase/task/artifact_class
```

Nếu chưa có history, dùng phase profile mặc định và đánh dấu confidence thấp.

---

## 7. Runtime estimation `T(i,j)`

Thay vì dùng một công thức mơ hồ, tính runtime theo các stage tuần tự.

```text
T(i,j) =
  T_download(i,j)
  + T_unpack(i,j)
  + T_setup(i,j)
  + T_run(i,j)
  + T_judge(i,j)
  + T_upload_result(i,j)
```

### 7.1 Download time

```text
T_download(i,j) =
  D_j.network_bytes / C_i.network_download_bytes_per_sec
```

Nếu `D_j.network_bytes = 0` thì `T_download = 0`.

### 7.2 Unpack time

Unzip phụ thuộc vào cả unzip throughput và disk write.

```text
T_unpack(i,j) =
  max(
    D_j.unzip_bytes / C_i.unzip_bytes_per_sec,
    D_j.disk_write_bytes_for_unzip / C_i.disk_write_bytes_per_sec
  )
```

Nếu job không cần unzip:

```text
T_unpack = 0
```

### 7.3 Setup time

```text
T_setup(i,j) =
  C_i.docker_startup_seconds
  + C_i.python_startup_seconds
  + phase_setup_overhead_seconds
```

`phase_setup_overhead_seconds` lấy từ lịch sử phase hoặc bằng 0 nếu chưa có.

### 7.4 Run time for output-only

Output-only chỉ chạy judge.

```text
T_run(i,j) = 0
```

`T_judge` được tính:

```text
T_judge(i,j) =
  D_j.cpu_ops / C_i.cpu_ops_per_sec
```

### 7.5 Run time for model inference

Nếu job có thể chạy CPU hoặc GPU, tính cả hai path.

CPU path:

```text
T_infer_cpu(i,j) =
  D_j.cpu_ops / C_i.cpu_ops_per_sec
```

GPU path:

```text
T_infer_gpu(i,j) =
  D_j.gpu_ops / C_i.gpu_ops_per_sec
  + gpu_transfer_overhead(i,j)
```

Nếu worker không có GPU:

```text
T_infer_gpu = infinity
```

Nếu `D_j.vram_bytes > C_i.available_vram_bytes` và GPU là required:

```text
T_infer_gpu = infinity
```

Nếu GPU không bắt buộc, CPU path vẫn được xét.

Chọn path tốt hơn:

```text
T_run(i,j) =
  min(T_infer_cpu, T_infer_gpu)
```

Execution path:

```text
execution_path(i,j) =
  "cpu" if T_infer_cpu <= T_infer_gpu
  "gpu" otherwise
```

### 7.6 Judge time after inference

Sau inference vẫn cần judge output:

```text
T_judge(i,j) =
  D_j.judge_cpu_ops / C_i.cpu_ops_per_sec
```

### 7.7 Upload result time

Thông thường nhỏ:

```text
T_upload_result(i,j) =
  result_bytes / C_i.network_upload_bytes_per_sec
```

Nếu chưa đo upload speed hoặc result nhỏ, có thể bỏ qua trong Lean V1.

---


---

## 7A. Two-Layer Runtime Estimator

Phần `Runtime estimation` không nên chỉ dừng ở công thức deterministic. Thiết kế đúng nên có **2 tầng estimator**.

### 7A.1 Tầng 1 — Cold-start deterministic estimator

Khi hệ thống chưa có nhiều log thật, dùng công thức dựa trên benchmark worker và demand vector của submission:

```text
T0(i,j) =
  T_download(i,j)
  + T_unpack(i,j)
  + T_setup(i,j)
  + T_run(i,j)
  + T_judge(i,j)
  + T_upload_result(i,j)
```

Trong đó:

```text
T_download = network_bytes / worker.network_download_bytes_per_sec
T_unpack   = unzip_bytes / worker.unzip_bytes_per_sec
T_setup    = docker_startup + python_startup + phase_setup_overhead
T_run      = inference/runtime estimate
T_judge    = judge_cpu_ops / worker.cpu_ops_per_sec
```

`T0(i,j)` là ước lượng ban đầu, không dùng hằng số cảm tính.

### 7A.2 Tầng 2 — Runtime learning from execution logs

Sau khi hệ thống chạy, mỗi completed job sinh ra execution log:

```text
actual_runtime_seconds
actual_peak_ram_bytes
actual_peak_vram_bytes
actual_disk_read_bytes
actual_disk_write_bytes
actual_network_bytes
predicted_runtime_seconds
worker_profile
submission_profile
phase_profile
execution_path        // cpu | gpu
workload_class        // output_public | output_private | inference_public | inference_private
```

Từ log này, hệ thống tính sai số dự đoán:

```text
error_ratio =
  actual_runtime_seconds / predicted_runtime_seconds
```

Sau đó group theo:

```text
g = (task_id, phase_key, execution_path, workload_class)
```

và tính correction factor:

```text
correction_factor(g) =
  median(error_ratio for completed jobs in group g)
```

Runtime estimate sau hiệu chỉnh:

```text
T(i,j) =
  T0(i,j) * correction_factor(g)
```

Nếu muốn estimate an toàn hơn cho scheduling:

```text
safe_T(i,j) =
  T0(i,j) * p95(error_ratio for group g)
```

Như vậy hệ thống càng chạy nhiều thì estimate càng tốt.

### 7A.3 Fallback khi chưa đủ dữ liệu

Nếu group cụ thể chưa có đủ log, fallback theo thứ tự:

```text
1. (task_id, phase_key, execution_path, workload_class)
2. (phase_key, execution_path, workload_class)
3. (workload_class, execution_path)
4. workload_class
5. raw T0(i,j)
```

Ví dụ:

```text
Nếu chưa có log cho task OCR private_final GPU,
dùng log chung của private_final GPU.
Nếu vẫn chưa có, dùng log chung của inference_private.
Nếu vẫn chưa có, dùng T0.
```

### 7A.4 Khi nào dùng regression?

Khi hệ thống đã có đủ dữ liệu, có thể fit một mô hình đơn giản:

```text
runtime = f(worker_profile, submission_profile, phase_profile)
```

Feature có thể gồm:

```text
artifact_size_bytes
prediction_rows
dataset_num_samples
model_size_bytes
cpu_ops_per_sec
gpu_ops_per_sec
memory_bandwidth
disk_read_bytes_per_sec
network_download_bytes_per_sec
phase_key
execution_path
workload_class
```

Các mô hình phù hợp giai đoạn đầu:

```text
linear regression
ridge regression
random forest
```

Tuy nhiên, trong Lean V1 chưa cần ML phức tạp. Cách hợp lý nhất là:

```text
T0 deterministic estimate
+
correction_factor from runtime history
```


## 8. `available_time_i` được tính thế nào?

Nếu mỗi worker chỉ chạy 1 job tại một thời điểm:

```text
available_time_i = now
```

vì worker chỉ request job khi nó rảnh.

Nếu worker có thể chạy nhiều job song song:

```text
max_parallel_jobs = C_i.max_parallel_jobs
active_claims_i = jobs currently running on worker i
```

Nếu:

```text
len(active_claims_i) < max_parallel_jobs
```

thì:

```text
available_time_i = now
```

Ngược lại:

```text
available_time_i =
  min(predicted_finish_time of active claims on worker i)
```

Trong đó:

```text
predicted_finish_time =
  claim_started_at + predicted_runtime_seconds
```

Nếu có per-worker scheduled queue, dùng thời điểm slot rảnh sớm nhất:

```text
available_time_i =
  earliest time at which one execution slot becomes free
```

---

## 9. `estimated_finish_time(i,j)`

Sau khi có `T(i,j)` và `available_time_i`:

```text
estimated_finish_time(i,j) =
  available_time_i + T(i,j)
```

Nếu tính dạng duration từ hiện tại:

```text
estimated_finish_delay(i,j) =
  (available_time_i - now) + T(i,j)
```

Trong code, nên dùng `estimated_finish_delay` để dễ so sánh.

---

## 10. Hard constraints

Trước khi tính cost, loại bỏ job không thể chạy.

Worker `i` chỉ eligible cho job `j` nếu:

```text
C_i.sandbox_passed = true
```

và:

```text
D_j.ram_bytes <= C_i.available_ram_bytes
D_j.disk_required_bytes <= C_i.available_disk_bytes
```

Nếu execution path là GPU và GPU bắt buộc:

```text
D_j.vram_bytes <= C_i.available_vram_bytes
C_i.gpu_ops_per_sec > 0
```

Nếu GPU không bắt buộc, nhưng không đủ VRAM:

```text
GPU path bị loại
CPU path vẫn được xét
```

Nếu cả CPU path và GPU path đều không khả thi:

```text
job bị loại khỏi candidate set cho worker này
```

---

## 11. Stress score `stress(i,j)`

Cần phân biệt hai loại tài nguyên:

1. **Throughput resources**: CPU, GPU, disk, network.  
   Chúng có đơn vị xử lý trên giây.
2. **Capacity resources**: RAM, VRAM, disk space.  
   Chúng có giới hạn dung lượng.

### 11.1 Stress cho throughput resource

Với tài nguyên throughput `r`:

```text
time_stress_r(i,j) =
  (D_j.r / C_i.r) / timeout_j
```

Ví dụ:

```text
CPU time estimate = 120s
timeout = 300s

CPU stress = 120 / 300 = 0.4
```

### 11.2 Stress cho capacity resource

Với tài nguyên dung lượng:

```text
capacity_stress_r(i,j) =
  D_j.r / C_i.r
```

Ví dụ:

```text
job cần RAM 10GB
worker có RAM 16GB

RAM stress = 10 / 16 = 0.625
```

### 11.3 Stress tổng

```text
stress(i,j) =
  max(
    all time_stress_r,
    all capacity_stress_r
  )
```

Diễn giải:

| Stress | Ý nghĩa |
|---|---|
| `< 1` | job phù hợp trong giới hạn |
| `≈ 1` | gần chạm ngưỡng |
| `> 1` | có nguy cơ timeout hoặc thiếu tài nguyên |

Stress không thay thế hard constraints, nhưng giúp xếp hạng job nào phù hợp hơn.

---

## 12. Timeout violation

```text
timeout_violation(i,j) =
  0 if T(i,j) <= timeout_j
  1 otherwise
```

Nếu không muốn schedule job có khả năng timeout, có thể hard-filter:

```text
if T(i,j) > timeout_j:
    skip job
```

Trong bản lexicographic, có thể giữ để so sánh, nhưng thực tế Lean V1 nên filter luôn để tránh lãng phí.

---

## 13. Resource scarcity

Để tránh lãng phí tài nguyên khan hiếm, tính scarcity từ trạng thái queue và worker pool.

Với resource `r`:

```text
queued_demand_r =
  sum(D_j.r for all waiting jobs j)
```

```text
available_capacity_r =
  sum(C_i.r_available for all idle/available workers i)
```

Nếu:

```text
available_capacity_r = 0 and queued_demand_r > 0
```

thì:

```text
scarcity_r = infinity
```

Nếu:

```text
queued_demand_r = 0
```

thì:

```text
scarcity_r = 0
```

Ngược lại:

```text
scarcity_r =
  queued_demand_r / available_capacity_r
```

Không cần đặt hằng số. Scarcity được tính từ trạng thái thực tế của hệ thống.

---

## 14. Resource waste `waste(i,j)`

Sau khi gán job `j` cho worker `i`, phần tài nguyên dư ra có thể được xem là waste.

Với resource `r`:

```text
unused_capacity_ratio(i,j,r) =
  max(0, C_i.r - D_j.r) / C_i.r
```

Resource waste:

```text
waste(i,j) =
  sum over r of
    scarcity_r * unused_capacity_ratio(i,j,r)
```

Nên chỉ tính waste trên các tài nguyên quan trọng:

```text
gpu_ops_per_sec
available_vram_bytes
cpu_ops_per_sec
available_ram_bytes
```

Ví dụ:

- nếu output-only job dùng GPU worker mạnh,
- `D_j.gpu_ops = 0`,
- GPU đang khan hiếm,
- thì `unused_capacity_ratio_gpu` cao và `scarcity_gpu` cao,
- waste cao.

Nếu GPU đang rảnh nhiều:

```text
scarcity_gpu thấp
```

thì việc dùng GPU worker cho job nhẹ ít bị phạt hơn.

---

## 15. Cost tuple

Với mỗi cặp worker/job:

```text
cost(i,j) =
(
  timeout_violation(i,j),
  estimated_finish_delay(i,j),
  stress(i,j),
  waste(i,j),
  created_at_j
)
```

Ý nghĩa:

1. Ưu tiên job không timeout.
2. Trong số đó, chọn job hoàn thành sớm nhất.
3. Nếu tương đương, chọn job ít stress hơn.
4. Nếu vẫn tương đương, chọn job ít lãng phí tài nguyên hơn.
5. Nếu vẫn tương đương, job cũ hơn được chọn trước.

So sánh theo lexicographic order:

```text
(a1,a2,a3,a4,a5) < (b1,b2,b3,b4,b5)
```

nếu phần tử đầu tiên khác nhau nhỏ hơn; nếu bằng thì xét phần tử tiếp theo.

Cách này tránh weighted sum với hằng số tùy ý.

---

## 16. Candidate jobs khi phase overlap

Vì phase có thể overlap, scheduler lấy candidate như sau:

```text
candidate_jobs =
  queued jobs where
    phase.open_time <= now <= phase.close_time
```

Không loại public/private chỉ vì phase khác đang mở.

Nếu `public_test` và `public_final` cùng active:

```text
candidate_jobs = jobs from both phases
```

Nếu `private_test` mở trong khi `public_final` còn active:

```text
candidate_jobs = jobs from private_test + public_final
```

Sau đó cost function sẽ tự quyết định job nào phù hợp với worker nào.

Nếu official contest đang active:

```text
candidate_jobs = candidate_jobs where entry_mode = official
```

---

## 17. Full scheduling algorithm

```python
def claim_job(worker_id, now):
    worker = load_worker_profile(worker_id)

    if not worker.sandbox_passed:
        return None

    jobs = get_queued_jobs()

    # Official-first policy
    if official_contest_active(now):
        jobs = [j for j in jobs if j.entry_mode == "official"]

    # Phase availability filter
    jobs = [
        j for j in jobs
        if j.phase.open_time <= now <= j.phase.close_time
    ]

    # Compute global scarcity once for current queue state
    scarcity = compute_resource_scarcity(jobs, get_available_workers())

    best_job = None
    best_cost = None
    best_plan = None

    for job in jobs:
        profile = build_or_load_job_profile(job)

        plan = estimate_execution_plan(worker, job, profile)

        if not plan.hard_constraints_ok:
            continue

        timeout_violation = 0 if plan.runtime_seconds <= job.timeout_seconds else 1

        # Lean V1 can skip likely-timeout jobs directly
        if timeout_violation == 1:
            continue

        available_time = compute_available_time(worker, now)
        finish_delay = (available_time - now) + plan.runtime_seconds

        stress = compute_stress(worker, job, profile, plan)
        waste = compute_waste(worker, profile, scarcity)

        cost = (
            timeout_violation,
            finish_delay,
            stress,
            waste,
            job.created_at
        )

        if best_cost is None or cost < best_cost:
            best_cost = cost
            best_job = job
            best_plan = plan

    if best_job is None:
        return None

    claim_job_for_worker(best_job, worker, best_plan)
    return best_job
```

---

## 18. Execution plan

`estimate_execution_plan(worker, job, profile)` trả về:

```text
ExecutionPlan = {
  execution_path,          // cpu | gpu
  runtime_seconds,
  hard_constraints_ok,
  expected_ram_bytes,
  expected_vram_bytes,
  expected_disk_bytes,
  reason_if_not_ok
}
```

### 18.1 CPU path

```text
runtime_cpu =
  T_download
  + T_unpack
  + T_setup
  + T_infer_cpu
  + T_judge
```

### 18.2 GPU path

```text
runtime_gpu =
  T_download
  + T_unpack
  + T_setup
  + T_infer_gpu
  + T_judge
```

GPU path only valid if:

```text
worker.gpu_ops_per_sec > 0
D_j.vram_bytes <= worker.available_vram_bytes
```

Final choice:

```text
if gpu_path_valid and runtime_gpu < runtime_cpu:
    execution_path = gpu
else:
    execution_path = cpu
```

If CPU path violates RAM or timeout and GPU path is valid, choose GPU.

---

## 19. Data-driven safety factor

Prediction can be wrong. Do not set a random multiplier like `1.5`.

For each completed job:

```text
prediction_error =
  actual_runtime / predicted_runtime
```

For each group:

```text
(task_id, phase_key, execution_path)
```

compute:

```text
safety_factor =
  p95(prediction_error)
```

Safe estimate:

```text
safe_runtime =
  predicted_runtime * safety_factor
```

If no history exists yet:

- use raw estimate,
- mark confidence as low,
- optionally run dry-run before final scheduling.

No arbitrary constant is required.

---


---

## 19A. EMA Update and How to Choose Alpha

Một cách cập nhật estimate đơn giản là Exponential Moving Average (EMA):

```text
new_estimate =
  (1 - alpha) * old_estimate
  + alpha * actual_runtime
```

Không nên ghi cứng:

```text
new_estimate = 0.8 * old_estimate + 0.2 * actual_runtime
```

vì sẽ bị hỏi:

> Vì sao là 0.8 và 0.2?

Thay vào đó, `alpha` nên được chọn có lý do.

### 19A.1 Cách 1 — Chọn alpha theo cửa sổ N gần nhất

Nếu muốn EMA phản ứng tương đương với trung bình của khoảng `N` job gần nhất, dùng:

```text
alpha = 2 / (N + 1)
```

Ví dụ:

```text
N = 10
alpha = 2 / 11 ≈ 0.18
```

Khi đó:

```text
new_estimate =
  0.82 * old_estimate
  + 0.18 * actual_runtime
```

Con số này có giải thích rõ ràng: estimator phản ứng theo khoảng 10 job gần nhất.

### 19A.2 Cách 2 — Chọn alpha bằng validation trên log cũ

Khi đã có runtime logs, thử nhiều giá trị alpha:

```text
alpha ∈ {0.05, 0.1, 0.2, 0.3, 0.5}
```

Với mỗi alpha, replay lại lịch sử job và đo lỗi:

```text
MAE = mean(abs(predicted_runtime - actual_runtime))
```

Chọn:

```text
alpha* = argmin MAE
```

Cách này tốt hơn vì alpha được chọn từ dữ liệu thực nghiệm, không phải cảm tính.

### 19A.3 EMA nên áp dụng cho cái gì?

EMA không nhất thiết cập nhật trực tiếp `T(i,j)` cho từng job riêng lẻ. Nên cập nhật theo group:

```text
group = (task_id, phase_key, execution_path, workload_class)
```

Ví dụ lưu:

```text
ema_runtime_seconds[group]
ema_error_ratio[group]
ema_peak_ram_bytes[group]
ema_peak_vram_bytes[group]
```

Sau khi job hoàn thành:

```text
ema_error_ratio_new =
  (1 - alpha) * ema_error_ratio_old
  + alpha * (actual_runtime / predicted_runtime)
```

Estimate mới:

```text
T(i,j) =
  T0(i,j) * ema_error_ratio[group]
```

Nếu cần an toàn hơn, scheduler vẫn có thể dùng `p95(error_ratio)` thay vì EMA trung bình.


## 20. Submission profiling workflow

### 20.1 Output-only submission

When complete upload:

```text
1. read CSV metadata,
2. count rows,
3. get file size,
4. build output-only job profile,
5. enqueue job.
```

### 20.2 Final/model submission

Recommended two-stage flow:

```text
1. upload artifact,
2. create profiling task,
3. run dry-run on small sample,
4. store dry_run_profile,
5. enqueue full judging job.
```

If dry-run is too expensive for Lean V1:

```text
1. use artifact metadata + phase history,
2. schedule conservatively,
3. record actual runtime,
4. improve estimator later.
```

---

## 21. Benchmark plan

Compare:

| Strategy | Description |
|---|---|
| FIFO | first queued job assigned to any worker |
| Phase-only | output jobs prefer CPU, final jobs prefer GPU |
| Capability-only | match by capability but no stress/waste |
| Proposed | runtime + stress + scarcity-aware waste + phase overlap support |

Metrics:

```text
average_waiting_time
p95_waiting_time
average_completion_time
makespan
timeout_rate
gpu_utilization
cpu_utilization
mismatch_rate
resource_waste
official_job_latency
```

Mismatch examples:

```text
output-only job assigned to scarce high-end GPU while CPU worker is idle
heavy inference job assigned to CPU while GPU worker is available
job assigned to worker with predicted timeout
```

---

## 22. Minimal implementation roadmap

### Step 1 — Benchmark worker

Implement agent benchmark fields:

```text
cpu_ops_per_sec
gpu_ops_per_sec
memory_bandwidth_bytes_per_sec
disk_read/write_bytes_per_sec
network_download_bytes_per_sec
unzip_bytes_per_sec
docker_startup_seconds
python_startup_seconds
available_ram/vram/disk
sandbox_passed
```

### Step 2 — Store profiles

Add:

```text
worker_profile_json
benchmark_version
last_benchmarked_at
```

### Step 3 — Build job profile

For output-only:

```text
file_size
prediction_rows
ground_truth_size
judge_profile
```

For final:

```text
artifact_size
model_size
dry_run_profile
dataset_num_samples
```

### Step 4 — Replace direct queue consume

Instead of workers directly consuming any stream job:

```text
worker -> POST /workers/claim-next
```

Server computes best job.

### Step 5 — Implement cost functions

Implement:

```text
estimate_runtime(worker, job)
compute_available_time(worker)
compute_stress(worker, job)
compute_scarcity(queue, workers)
compute_waste(worker, job)
```

### Step 6 — Benchmark against baselines

Run synthetic workloads and collect metrics.

---

## 23. Final summary

The final scheduling idea is:

> Do not classify workers using fixed thresholds. Do not classify jobs only as light/medium/heavy using intuition. Instead, benchmark each worker into a measurable capability vector, profile each submission into a resource demand vector, estimate runtime from actual throughput, compute stress and resource waste, and choose jobs using lexicographic cost. This makes the scheduling policy explainable, data-driven, and suitable for a distributed volunteer judging system.

