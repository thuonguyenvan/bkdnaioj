# Phase 02 — Judge Script Sandbox

**Nhóm:** A - Đóng góp chính  
**Effort:** 3h  
**Priority:** P1

## Overview

Hoàn thiện cơ chế Docker Sandbox cho bài chấm. Hiện tại:
- `run_final()` trong [volunteer-agent/app/runner.py](../../volunteer-agent/app/runner.py): Có Docker isolation nhưng **thiếu `--pids-limit`** (nguy hiểm)
- `_run_judge()` (line 100): Chạy judge script bằng `subprocess.run` **không có isolation nào** — điểm mù lớn

Mục tiêu: đo overhead sandbox vs bare, lập bảng Threat × Defense, có số liệu thực nghiệm đẹp.

## Files cần sửa / tạo

| Action | File | Mô tả |
|--------|------|--------|
| modify | `volunteer-agent/app/runner.py` | Thêm pids_limit, wrap _run_judge vào sandbox |
| create | `volunteer-agent/tests/test_sandbox.py` | Test harness đo overhead + threat detection |
| create | `volunteer-agent/demo/sandbox_benchmark.py` | Script benchmark độc lập để thu thập số liệu |

## Key Insight từ code hiện tại

```python
# runner.py line 44-56 — run_final() có Docker nhưng thiếu:
container = client.containers.create(
    image=image_name,
    ...
    network_mode="none",      # ✓ network isolated
    mem_limit="512m",         # ✓ memory limited
    nano_cpus=1000000000,     # ✓ 1 CPU
    # THIẾU: pids_limit — fork bomb có thể crash Docker Desktop!
)

# runner.py line 100-118 — _run_judge() KHÔNG có isolation:
p = subprocess.run(
    ["python", judge, ...],
    capture_output=True,
    check=True,
    timeout=int(os.getenv("SANDBOX_TIMEOUT_S", "300")),
    # Không có: memory limit, CPU limit, PID limit, network isolation
)
```

## Implementation Steps

### 1. Fix `run_final()` — thêm pids_limit (URGENT, làm trước khi test)
```python
container = client.containers.create(
    image=image_name,
    command=[...],
    volumes={volume_name: {"bind": "/app/shared-temp", "mode": "rw"}},
    network_mode="none",
    mem_limit="512m",
    nano_cpus=1_000_000_000,
    pids_limit=64,   # THÊM: ngăn fork bomb
)
```

### 2. Wrap `_run_judge()` vào Docker sandbox (optional flag)
Thêm `use_sandbox: bool` parameter. Khi `JUDGE_SANDBOX=1`:
```python
def _run_judge(self, ..., use_sandbox: bool = False) -> dict:
    if use_sandbox and self._docker_available():
        return self._run_judge_sandboxed(...)
    return self._run_judge_bare(...)

def _run_judge_sandboxed(self, ...) -> dict:
    # Tương tự run_final() nhưng chạy judge script thay vì inference
    container = client.containers.create(
        image="python:3.11-slim",
        command=["python", judge, "--submission-dir", ..., "--output-dir", ...],
        network_mode="none",
        mem_limit="256m",
        nano_cpus=1_000_000_000,
        pids_limit=64,
    )
    ...
```

### 3. Tạo `sandbox_benchmark.py` — script đo overhead

```python
# volunteer-agent/demo/sandbox_benchmark.py
"""
Benchmark: sandbox vs bare subprocess
Đo: wall-clock latency, peak memory, exit code accuracy, threat detection
"""

WORKLOADS = {
    "benign":    "scripts/benign_sklearn.py",      # sklearn predict
    "fork_bomb": "scripts/fork_bomb.py",           # os.fork() loop
    "mem_bomb":  "scripts/mem_bomb.py",            # bytearray escalation
    "inf_loop":  "scripts/infinite_loop.py",       # while True
}

RUNS = 30  # lặp để lấy p50/p95

for workload_name, script in WORKLOADS.items():
    for mode in ["bare", "sandbox"]:
        times = []
        for _ in range(RUNS):
            start = time.perf_counter()
            run_script(script, sandboxed=(mode == "sandbox"))
            times.append(time.perf_counter() - start)
        print(f"{workload_name}/{mode}: p50={p50(times):.3f}s, p95={p95(times):.3f}s")
```

### 4. Tạo threat workloads

```bash
volunteer-agent/demo/scripts/
├── benign_sklearn.py       # normal ML job
├── fork_bomb.py            # os.fork() infinite loop
├── mem_bomb.py             # bytearray(1024*1024) * 1000
└── infinite_loop.py        # while True: pass
```

### 5. Bảng kết quả kỳ vọng (template báo cáo)

| Workload | Bare (bị kill?) | Sandbox (bị kill?) | Overhead sandbox |
|----------|-----------------|---------------------|-----------------|
| benign   | ✓ (thành công) | ✓ (thành công) | +X% ms |
| fork_bomb | ✗ (crash host) | ✓ (pids_limit kill) | — |
| mem_bomb | ✗ (OOM host) | ✓ (mem_limit kill) | — |
| inf_loop | ✗ (timeout only) | ✓ (container kill) | — |

## Experiment Design (cho báo cáo)

**Câu hỏi nghiên cứu:** Docker sandbox có overhead thời gian bao nhiêu so với bare subprocess? Và nó ngăn được những mối đe dọa nào?

**Thực nghiệm 2×4:**
- Chiều 1: `{bare, sandbox}`
- Chiều 2: `{benign, fork_bomb, mem_bomb, infinite_loop}`

**Metrics thu thập:**
- Wall-clock latency p50/p95 (30 runs)
- Overhead % = (sandbox_time - bare_time) / bare_time × 100
- Threat neutralization: bị kill đúng không? (binary)
- Resource measurement accuracy: CPU/RAM đo từ cgroup vs psutil

## Dependency với Phase 03

`sandbox_passed` là **hard constraint** trong scheduler của Phase 03: worker không có `sandbox_passed=True` sẽ không nhận được job nào. Do đó Phase 02 phải đảm bảo:

1. Benchmark trong Phase 03 (`_benchmark()`) set `sandbox_passed` chính xác — dựa trên kết quả `docker run hello-world`
2. Giá trị `sandbox_passed` được lưu vào `capabilities` JSON khi `register()` — kiểm tra `volunteer-agent/app/cli.py:89` đang truyền `{**caps, "benchmark": bench_results}` nhưng `sandbox_passed` nằm trong `bench_results`, cần đảm bảo Go API đọc được từ `capabilities["benchmark"]["sandbox_passed"]`
3. `_run_judge_sandboxed()` khi implement phải fail gracefully — không crash worker thread, trả về error để Phase 03 scheduler không re-assign job vào cùng worker

## Risk

- **Fork bomb test**: PHẢI thêm `pids_limit=64` trước khi chạy — thiếu thì crash Docker Desktop
- **macOS vs Linux**: Docker Desktop trên macOS có VM overhead → số liệu cao hơn thực tế. Ghi chú rõ môi trường test.

## Success Criteria

- [ ] `pids_limit=64` được thêm vào tất cả `containers.create()` calls
- [ ] `_run_judge()` có flag `use_sandbox` hoạt động
- [ ] `sandbox_benchmark.py` chạy được và xuất bảng p50/p95
- [ ] Threat workloads bị kill đúng trong sandbox mode
- [ ] Có bảng Threat × Defense cho báo cáo
