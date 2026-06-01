# Phase 01 — Setup & Baseline

**Status:** Pending | **Effort:** 1h

## Mục tiêu

Chuẩn bị môi trường test và xác định baseline response time khi không có tải.

## Yêu cầu trước khi test

### 1. Hệ thống đã có sẵn

- [ ] Contest đã tạo và published
- [ ] Task ZHVI đã có phase `public_test` với evaluation set uploaded (`ground_truth.vi`, `inputs.zh`, `judge.py`)
- [ ] Task Sudoku đã có phase `public_test` với evaluation set uploaded (`ground_truth.zip`, `inputs.zip`, `judge.py`)
- [ ] Ít nhất 1 judge worker đang chạy (official worker)
- [ ] Ít nhất 5 user accounts test đã tạo sẵn (để tránh rate-limit register)
- [ ] Ít nhất 5 contest entries đã approved (1 per test user)

### 2. Cài k6

```bash
# macOS
brew install k6

# Linux
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6

# Verify
k6 version
```

### 3. Chuẩn bị test data directory

```
load-tests/
├── k6/
│   ├── config.js          # URL, credentials, IDs
│   ├── helpers.js         # shared utilities (upload flow)
│   ├── 01-baseline.js
│   ├── 02-read-load.js
│   ├── 03-submit-wave-zhvi.js
│   ├── 04-submit-wave-sudoku.js
│   └── 05-stress.js
├── fixtures/
│   ├── submission_zhvi.csv        # copy từ draft/
│   └── submission_sudoku.zip      # copy từ draft/
└── results/
    └── (output JSON files)
```

```bash
mkdir -p load-tests/k6 load-tests/fixtures load-tests/results
cp draft/contract-driven-demo-zhvi/contestant/non_final_public/submission.csv \
   load-tests/fixtures/submission_zhvi.csv
cp draft/contract-driven-demo-sudoku/contestant/non_final_public_submission.zip \
   load-tests/fixtures/submission_sudoku.zip
```

### 4. Config file

**File:** `load-tests/k6/config.js`

```javascript
export const CONFIG = {
  BASE_URL: 'https://YOUR-API.vercel.app',  // thay bằng URL thực

  // Pre-created test accounts (email/password)
  USERS: [
    { email: 'test1@example.com', password: 'Test123!' },
    { email: 'test2@example.com', password: 'Test123!' },
    { email: 'test3@example.com', password: 'Test123!' },
    { email: 'test4@example.com', password: 'Test123!' },
    { email: 'test5@example.com', password: 'Test123!' },
  ],

  // IDs từ database (lấy sau khi setup contest)
  CONTEST_ID:          'UUID-HERE',
  ZHVI_TASK_ID:        'UUID-HERE',
  ZHVI_PHASE_ID:       'UUID-HERE',
  SUDOKU_TASK_ID:      'UUID-HERE',
  SUDOKU_PHASE_ID:     'UUID-HERE',

  // 1 entry per user (pre-approved)
  ENTRY_IDS: [
    'UUID-entry-1',
    'UUID-entry-2',
    'UUID-entry-3',
    'UUID-entry-4',
    'UUID-entry-5',
  ],
};
```

## Baseline Test

**File:** `load-tests/k6/01-baseline.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { CONFIG } from './config.js';

export const options = {
  vus: 1,
  iterations: 10,
};

export default function () {
  // 1. Health check
  let r = http.get(`${CONFIG.BASE_URL}/healthz`);
  check(r, { 'healthz 200': (r) => r.status === 200 });

  // 2. Contest list
  r = http.get(`${CONFIG.BASE_URL}/api/v1/contests`);
  check(r, { 'contests 200': (r) => r.status === 200 });

  // 3. Login
  r = http.post(`${CONFIG.BASE_URL}/api/v1/auth/login`, JSON.stringify({
    email: CONFIG.USERS[0].email,
    password: CONFIG.USERS[0].password,
  }), { headers: { 'Content-Type': 'application/json' } });
  check(r, { 'login 200': (r) => r.status === 200 });

  const token = r.json('token');
  const authHeaders = { headers: { Authorization: `Bearer ${token}` } };

  // 4. Leaderboard
  r = http.get(`${CONFIG.BASE_URL}/api/v1/contests/${CONFIG.CONTEST_ID}/leaderboard`, authHeaders);
  check(r, { 'leaderboard 200': (r) => r.status === 200 });

  sleep(1);
}
```

**Chạy baseline:**
```bash
k6 run load-tests/k6/01-baseline.js \
  --out json=load-tests/results/baseline.json
```

**Metrics cần ghi nhận:**
- `http_req_duration` p95 cho từng endpoint
- Không có lỗi → baseline xác nhận hệ thống đang hoạt động bình thường

## Checklist

- [ ] k6 cài xong, `k6 version` OK
- [ ] Fixtures copy về `load-tests/fixtures/`
- [ ] `config.js` điền đủ UUIDs và URLs
- [ ] Baseline chạy 10 iterations không có error
- [ ] Ghi lại baseline p95 response time của từng endpoint
