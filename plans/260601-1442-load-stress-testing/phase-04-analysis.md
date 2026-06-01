# Phase 04 — Analysis & Recommendations

**Status:** Pending | **Effort:** 1h

## Cách đọc kết quả k6

```bash
# Summary sau khi chạy xong
k6 run script.js

# Hoặc phân tích JSON output
cat load-tests/results/read-load.json | jq '.metrics.http_req_duration'
```

**Metrics quan trọng:**
- `http_req_duration` — response time (p50, p95, p99)
- `http_req_failed` — tỷ lệ lỗi
- `http_reqs` — tổng số requests
- `iterations` — số lần VU chạy xong 1 vòng

## Dự đoán Bottleneck theo thứ tự khả năng

### 1. Supabase connection pool (HIGH RISK)

**Free tier:** 60 connections max. Pgbouncer có pool-mode transaction.

Với 50 concurrent users × mỗi request mở 1 connection:
- Nếu API dùng connection pool đúng cách → OK
- Nếu không → `connection timeout` errors

**Cách check:**
```sql
-- Chạy trên Supabase SQL Editor trong khi test đang chạy
SELECT count(*) FROM pg_stat_activity WHERE state = 'active';
```

**Fix nếu bị:**
- Dùng pgbouncer transaction mode (đã có sẵn ở Supabase)
- Hoặc upgrade Supabase plan

### 2. Judge Worker Throughput (CERTAIN BOTTLENECK khi nhiều submit)

1 official worker → xử lý tuần tự → throughput:
- **ZHVI:** <1s/job → ~60 submissions/phút max
- **Sudoku:** 2-5s/job → 12-30 submissions/phút max

Nếu submit rate > throughput → queue tích lũy → submission "stuck queued".

**Threshold thực tế:**
- Bình thường: < 10 submissions/phút → không có vấn đề
- Contest cuối: 50 người submit → queue backlog 2-5 phút cho ZHVI, 15-25 phút cho Sudoku

**Giải pháp nếu cần:**
- Thêm volunteer workers (đã build ở phase trước!)
- Scale official worker horizontal

### 3. MinIO Upload Bandwidth (MEDIUM RISK)

Sudoku submission = 12MB. Nếu nhiều người upload cùng lúc:
- 10 users × 12MB = 120MB cùng lúc
- Upload time phụ thuộc network và MinIO server capacity

**Cách check:** `http_req_duration{step:upload}` trong k6

### 4. Leaderboard Query (LOW-MEDIUM RISK)

Leaderboard là aggregation query phức tạp. Cần check slow query log.

**Fix nếu chậm:**
- Thêm index
- Cache leaderboard với Redis (TTL 30s)

## Template ghi kết quả

```markdown
## Load Test Results — [date]

### Environment
- API URL: 
- Worker count: 
- Supabase tier:

### Scenario A: Read Load
- Max VUs tested: 
- p95 leaderboard: 
- p95 contests: 
- Error rate: 
- Observed bottleneck:

### Scenario B: ZHVI Submit Wave
- Max concurrent submitters: 
- p95 initiate: 
- p95 complete: 
- End-to-end judging time: 
- Max queue depth observed:
- Breaking point:

### Scenario C: Sudoku Submit Wave
- Max concurrent submitters: 
- p95 upload (12MB): 
- End-to-end judging time: 
- Queue backlog at 5 concurrent:
- Breaking point:

### Scenario D: Mixed
- Read VUs: 40, Submit VUs: 10
- System stable: Y/N
- DB connections peak:

### Breaking Points
| Resource | Safe limit | Breaking point |
|----------|-----------|----------------|
| DB connections | | |
| Concurrent submissions | | |
| Read API | | |

### Recommendations
- [ ] Action item 1
- [ ] Action item 2
```

## Quick Wins sau khi có kết quả

| Nếu thấy | Fix |
|----------|-----|
| DB connection errors | Verify pgxpool maxConns config trong backend |
| Leaderboard > 2s | Add DB index hoặc Redis cache |
| Queue backlog > 5min | Start thêm volunteer worker |
| Upload slow | Dùng multipart upload cho file > 5MB |
| Submission stuck queued | Check worker heartbeat, restart if needed |
