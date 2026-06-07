# OLPAI Volunteer Judge Agent

Volunteer workers help judge submissions during AI contests by running the judge script on their local machine.

## Requirements

- Python 3.11+
- 4 GB RAM minimum
- 10 GB free disk
- Docker (optional — needed for final-phase inference sandbox)
- `olpai-final-runtime:latest` Docker image for sandboxed final inference

## Install

```bash
pip install olpai-volunteer-agent
```

Build the standard final inference image from the platform repository:

```bash
docker build -f runtime/Dockerfile -t olpai-final-runtime:latest .
```

Use `OLPAI_SANDBOX_IMAGE` or the `sandbox_image` config field when an equivalent
prebuilt image is hosted in a registry.

The standard environment includes the published machine-learning, NLP, data,
image-processing, visualization, and utility libraries. Contest code cannot
install additional packages during evaluation, and sandbox network access is
disabled.

Or from source:
```bash
git clone ...
cd volunteer-agent
pip install -e ".[docker]"
```

## Usage

### Step 1 — First-time setup wizard

```bash
olpai-volunteer setup
```

Wizard sẽ:
- Hỏi Platform URL và tên máy
- Tự collect CPU/RAM/GPU/disk info
- Chạy benchmark nhẹ
- Đăng ký với platform → in Worker ID

### Step 2 — Chờ admin approve

Admin vào `/admin/workers` → Approve → copy token.

### Step 3 — Lưu token

```bash
olpai-volunteer approve-token <TOKEN-FROM-ADMIN>
```

### Step 4 — Chạy

```bash
# Foreground (dev/test)
olpai-volunteer start

# Background service (production)
olpai-volunteer service install
olpai-volunteer service start
```

---

## Tất cả commands

```
olpai-volunteer setup              First-run wizard + register
olpai-volunteer approve-token <T>  Lưu token sau khi admin approve
olpai-volunteer start              Chạy foreground
olpai-volunteer doctor             Kiểm tra môi trường
olpai-volunteer benchmark          Đo hiệu suất CPU/disk
olpai-volunteer status             Xem config + trạng thái
olpai-volunteer logs               Xem logs (service mode)
olpai-volunteer logs -f            Follow logs

olpai-volunteer service install    Cài system service (auto-start)
olpai-volunteer service start      Bật service
olpai-volunteer service stop       Tắt service
olpai-volunteer service uninstall  Gỡ service
```

## Config file

Sau khi `setup`, config lưu tại `~/.olpai/agent/config.toml`:

```toml
api_url = "https://judge.example.com"
worker_name = "Lab-RTX4090"
worker_token = "abc123..."
poll_interval_s = 10
heartbeat_interval_s = 30
sandbox_timeout_s = 600
```

Có thể override bằng env var: `API_URL`, `WORKER_TOKEN`, `WORKER_NAME`, v.v.

## Optional dependencies

```bash
pip install Pillow numpy      # cho bài xử lý ảnh (Sudoku, v.v.)
pip install pynvml            # detect GPU NVIDIA
```
