# Phase 05 — Integration & Deployment

**Status:** Pending | **Effort:** 2h | **Depends on:** Phase 01-04

## Overview

Kết nối tất cả các phần lại, update Docker setup, viết hướng dẫn cài đặt cho volunteer.

## Docker Changes

### Volunteer Agent Docker Compose (cho local test)

**Modify:** `backend/docker-compose.yml` (thêm service cho test)

```yaml
volunteer-judge-agent:
  build: ../volunteer-agent
  environment:
    API_URL: http://api:8080
    WORKER_TOKEN: ${VOLUNTEER_WORKER_TOKEN:-}  # set sau khi approved
    WORKER_NAME: "local-test-volunteer"
    POLL_INTERVAL_S: "5"
    HEARTBEAT_INTERVAL_S: "15"
    SANDBOX_TIMEOUT_S: "120"
  depends_on:
    - api
  profiles:
    - volunteer  # opt-in: docker compose --profile volunteer up
```

### Production (volunteer chạy độc lập)

Volunteer KHÔNG cần chạy chung docker-compose với hệ thống. Chạy standalone:

```bash
docker run -d \
  -e API_URL=https://judge.bkdnaioj.com \
  -e WORKER_TOKEN=<token> \
  -e WORKER_NAME=$(hostname) \
  -v /var/run/docker.sock:/var/run/docker.sock \
  ghcr.io/bkdnaioj/volunteer-agent:latest
```

## MinIO Presigned URL Access

Volunteer download artifact trực tiếp từ MinIO qua presigned URL. Cần đảm bảo:

**Option A: MinIO publicly accessible** (đơn giản)
- MinIO endpoint phải accessible từ internet
- Presigned URL đã có auth built-in → an toàn

**Option B: API proxy download** (nếu MinIO nội bộ)
- Thêm endpoint `GET /api/v1/worker/artifacts/*` làm proxy
- API download từ MinIO và stream về cho volunteer
- Chậm hơn nhưng không cần expose MinIO

**V1 recommendation:** Option A nếu deployment cho phép. Nếu không, implement proxy sau.

## Environment Variables Summary

### API Server (thêm vào `.env`)
```bash
WORKER_JOB_TIMEOUT_MINUTES=10   # sau bao lâu reclaim stale job
```

### Volunteer Agent
```bash
API_URL=https://judge.bkdnaioj.com   # required
WORKER_TOKEN=<64-char-hex>           # required (sau khi approved)
WORKER_NAME=lab-rtx4090              # optional (default: hostname)
POLL_INTERVAL_S=10                   # optional
HEARTBEAT_INTERVAL_S=30              # optional
SANDBOX_TIMEOUT_S=600                # optional
```

## Testing Checklist

### Unit tests (Phase 02)
- [ ] `TestWorkerAuth_ValidToken` — valid token passes middleware
- [ ] `TestWorkerAuth_InvalidToken` — 401 returned
- [ ] `TestNextJob_WorkerBusy` — returns `{"job": null}` nếu đang có job
- [ ] `TestNextJob_NoJob` — returns `{"job": null}` nếu stream trống
- [ ] `TestSubmitResult_WrongJob` — 403 nếu submit job không phải của mình
- [ ] `TestTimeoutReclaim` — stale jobs được reclaim sau timeout

### Integration test (manual)
1. Start local stack: `docker compose up api redis minio db`
2. Create contest + task + phase + evaluation set (với judge.py)
3. Register volunteer (no token): `API_URL=http://localhost:8080 olpai-volunteer`
4. Admin approve qua UI → copy token
5. Start volunteer với token
6. Submit bài qua frontend
7. Verify: volunteer nhận job, chấm, trả kết quả → leaderboard update

## Hướng dẫn cho Volunteer (README)

**File:** `volunteer-agent/README.md`

```markdown
# OLPAI Volunteer Judge Agent

## Yêu cầu
- Python 3.11+
- Docker (required cho final phases, optional cho public test)
- Disk: ít nhất 10GB trống
- RAM: ít nhất 4GB

## Cài đặt

### Option 1: pip
pip install olpai-volunteer-agent

### Option 2: Docker
docker pull ghcr.io/bkdnaioj/volunteer-agent:latest

## Đăng ký

Lần đầu chạy không cần token:
API_URL=https://judge.bkdnaioj.com WORKER_NAME="tên-máy" olpai-volunteer

Liên hệ admin để được approve. Admin sẽ cấp WORKER_TOKEN.

## Chạy

WORKER_TOKEN=<token> API_URL=https://judge.bkdnaioj.com olpai-volunteer

## Dừng

Ctrl+C (graceful shutdown, không mất job đang chạy)
```

## Files to Create/Modify

- `volunteer-agent/README.md`
- `backend/docker-compose.yml` — thêm volunteer service (profile opt-in)
- `backend/.env.example` — thêm `WORKER_JOB_TIMEOUT_MINUTES`

## Todo

- [ ] Update docker-compose.yml
- [ ] Update .env.example
- [ ] Viết README cho volunteer
- [ ] Manual integration test

## Success Criteria

- Volunteer cài được trên máy khác, không cần config Redis/DB/MinIO
- End-to-end: submit → volunteer nhận → chấm → score hiện trên leaderboard
- Nếu volunteer offline → official worker chấm như thường (fallback transparent)
- Stale job (volunteer crash) → auto reclaim trong 10 phút
