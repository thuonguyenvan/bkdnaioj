# Phase 03 — Stress Test & Breaking Point

**Status:** Pending | **Effort:** 1h

## Mục tiêu

Tăng tải đến khi hệ thống bắt đầu lỗi để tìm breaking point. **Chạy trên staging, không dùng production data thật.**

## Spike Test — Đột ngột nhiều người submit

Mô phỏng tình huống cuối contest: tất cả thí sinh nộp bài cùng lúc.

**File:** `load-tests/k6/06-spike.js`

```javascript
import { login, submitFile } from './helpers.js';
import { SharedArray } from 'k6/data';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { CONFIG } from './config.js';

const zhviFile = new SharedArray('zhvi', function () {
  return [open('../../fixtures/submission_zhvi.csv', 'b')];
});

export const options = {
  stages: [
    { duration: '10s', target: 5  },   // warm up
    { duration: '10s', target: 50 },   // instant spike to 50
    { duration: '1m',  target: 50 },   // hold spike
    { duration: '10s', target: 5  },   // drop back
    { duration: '30s', target: 5  },   // hold low
  ],
  thresholds: {
    'http_req_failed': ['rate<0.20'],   // accept higher error rate during spike
  },
};

export default function () {
  const idx = __VU % CONFIG.USERS.length;
  const token = login(CONFIG.BASE_URL, CONFIG.USERS[idx].email, CONFIG.USERS[idx].password);

  submitFile(
    CONFIG.BASE_URL, token, CONFIG.ENTRY_IDS[idx],
    CONFIG.ZHVI_TASK_ID, CONFIG.ZHVI_PHASE_ID,
    'submission.csv', zhviFile[0], 'text/csv'
  );

  sleep(2);
}
```

## Soak Test — Chạy lâu dài

Tìm memory leak, connection leak sau nhiều giờ.

```javascript
export const options = {
  stages: [
    { duration: '5m',  target: 10 },   // ramp
    { duration: '2h',  target: 10 },   // hold 2 tiếng
    { duration: '5m',  target: 0  },
  ],
};
```

> ⚠️ Chỉ chạy soak test khi đã pass load test và có thời gian monitor.

## Database Connection Stress

Test khi DB connections exhausted. Supabase free tier limit = 60.

```javascript
export const options = {
  stages: [
    { duration: '30s', target: 30  },
    { duration: '1m',  target: 60  },   // 60 concurrent → near limit
    { duration: '30s', target: 100 },   // exceed limit
    { duration: '1m',  target: 100 },   // observe behavior
    { duration: '30s', target: 0   },
  ],
};
```

**Quan sát:**
- Khi > 60 concurrent: API trả lỗi gì? 500 hay 503?
- Có graceful degradation không?
- Connection pool recovery sau khi giảm tải?

## Checklist & Dấu hiệu Breaking Point

| Symptom | Likely cause | Action |
|---------|-------------|--------|
| `p99 > 10s` | DB slow queries | Check Supabase slow query log |
| `error_rate > 5%` | Connection pool exhausted | Tăng pool hoặc nâng Supabase tier |
| `http_req_failed` tăng đột biến | API crash/restart | Check Vercel function logs |
| Submissions stuck ở `queued` | Judge worker down | Restart worker, check Redis |
| Upload `4xx` | MinIO/S3 limit | Check MinIO logs |

## Metrics cần ghi lại

```
Scenario          | Max VUs | p95 latency | Error rate | Breaking point
------------------|---------|-------------|------------|---------------
Read load         |         |             |            |
ZHVI submit wave  |         |             |            |
Sudoku submit     |         |             |            |
Mixed             |         |             |            |
Spike             |         |             |            |
```

## Commands

```bash
# Spike
k6 run load-tests/k6/06-spike.js --out json=load-tests/results/spike.json

# Soak (optional)
k6 run load-tests/k6/07-soak.js --out json=load-tests/results/soak.json
```
