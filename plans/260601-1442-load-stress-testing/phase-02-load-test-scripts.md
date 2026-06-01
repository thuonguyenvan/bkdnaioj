# Phase 02 — Load Test Scripts (k6)

**Status:** Pending | **Effort:** 3h

## Tổng quan 4 kịch bản

| # | Kịch bản | Mục đích | Tool |
|---|----------|----------|------|
| A | Read Load | Leaderboard + contest API chịu được bao nhiêu concurrent reads | k6 |
| B | Submit Wave (ZHVI) | Nhiều user submit cùng lúc, file nhỏ, judge nhanh | k6 |
| C | Submit Wave (Sudoku) | File lớn 12MB, judge chậm → test queue backlog | k6 |
| D | Mixed Realistic | Kết hợp read + write giống usage thực tế | k6 |

---

## Helper: Upload Flow

**File:** `load-tests/k6/helpers.js`

Submission flow gồm 3 bước: initiate → upload to MinIO → complete.

```javascript
import http from 'k6/http';
import { check } from 'k6';
import encoding from 'k6/encoding';

export function login(baseURL, email, password) {
  const r = http.post(`${baseURL}/api/v1/auth/login`, JSON.stringify({ email, password }), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(r, { 'login ok': (r) => r.status === 200 });
  return r.json('token');
}

export function submitFile(baseURL, token, entryId, taskId, phaseId, filename, fileBytes, contentType) {
  const authJson = { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };

  // Step 1: Initiate — get presigned PUT URL
  const initiateBody = JSON.stringify({
    task_id: taskId,
    phase_id: phaseId,
    files: [{ filename, content_type: contentType, size_bytes: fileBytes.byteLength }],
  });
  const initiateRes = http.post(`${baseURL}/api/v1/entries/${entryId}/submissions:initiate`, initiateBody, authJson);
  check(initiateRes, { 'initiate 201': (r) => r.status === 201 });
  if (initiateRes.status !== 201) return null;

  const sub = initiateRes.json();
  const upload = sub.files[0];

  // Step 2: Upload directly to MinIO/S3 presigned URL
  const uploadRes = http.put(upload.put_url, fileBytes, {
    headers: { 'Content-Type': contentType },
  });
  check(uploadRes, { 'upload 200': (r) => r.status === 200 || r.status === 204 });

  // Step 3: Complete — trigger judge
  const completeBody = JSON.stringify({
    submission_id: sub.id,
    files: [{ filename, object_key: upload.object_key, size_bytes: fileBytes.byteLength }],
  });
  const completeRes = http.post(`${baseURL}/api/v1/submissions/${sub.id}/complete`, completeBody, authJson);
  check(completeRes, { 'complete 200': (r) => r.status === 200 });

  return sub.id;
}
```

---

## Kịch bản A — Read Load Test

**Mục đích:** Tìm giới hạn concurrent reads của API + DB (leaderboard, tasks, submissions).

**File:** `load-tests/k6/02-read-load.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { CONFIG } from './config.js';
import { login } from './helpers.js';

export const options = {
  stages: [
    { duration: '30s', target: 20 },   // ramp up to 20 users
    { duration: '1m',  target: 50 },   // ramp up to 50 users
    { duration: '2m',  target: 50 },   // hold at 50
    { duration: '30s', target: 100 },  // spike to 100
    { duration: '1m',  target: 100 },  // hold
    { duration: '30s', target: 0 },    // ramp down
  ],
  thresholds: {
    'http_req_duration{endpoint:leaderboard}': ['p95<2000'],
    'http_req_duration{endpoint:contests}':    ['p95<500'],
    'http_req_failed': ['rate<0.01'],          // <1% error rate
  },
};

export default function () {
  const user = CONFIG.USERS[__VU % CONFIG.USERS.length];
  const token = login(CONFIG.BASE_URL, user.email, user.password);
  const auth = { headers: { Authorization: `Bearer ${token}` } };

  // Contest list
  let r = http.get(`${CONFIG.BASE_URL}/api/v1/contests`, { tags: { endpoint: 'contests' } });
  check(r, { 'contests ok': (r) => r.status === 200 });

  // Task list
  r = http.get(`${CONFIG.BASE_URL}/api/v1/contests/${CONFIG.CONTEST_ID}/tasks`, { ...auth, tags: { endpoint: 'tasks' } });
  check(r, { 'tasks ok': (r) => r.status === 200 });

  // Leaderboard (heaviest query)
  r = http.get(`${CONFIG.BASE_URL}/api/v1/leaderboards/contest/${CONFIG.CONTEST_ID}`, { ...auth, tags: { endpoint: 'leaderboard' } });
  check(r, { 'leaderboard ok': (r) => r.status === 200 });

  // Submissions history
  r = http.get(`${CONFIG.BASE_URL}/api/v1/entries/${CONFIG.ENTRY_IDS[__VU % CONFIG.ENTRY_IDS.length]}/submissions`, { ...auth, tags: { endpoint: 'submissions' } });
  check(r, { 'submissions ok': (r) => r.status === 200 });

  sleep(Math.random() * 2 + 1);  // random think time 1-3s
}
```

**Chạy:**
```bash
k6 run load-tests/k6/02-read-load.js \
  --out json=load-tests/results/read-load.json
```

**Pass criteria:**
- p95 leaderboard < 2s
- Error rate < 1%
- Không có DB connection exhaustion (check Supabase dashboard)

---

## Kịch bản B — Submit Wave ZHVI (file nhỏ, judge nhanh)

**Mục đích:** Test throughput submission pipeline với nhiều user nộp cùng lúc.

**File:** `load-tests/k6/03-submit-wave-zhvi.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { CONFIG } from './config.js';
import { login, submitFile } from './helpers.js';

// Load ZHVI fixture một lần, dùng chung giữa các VUs
const zhviFile = new SharedArray('zhvi', function () {
  return [open('../../fixtures/submission_zhvi.csv', 'b')];
});

export const options = {
  scenarios: {
    submit_wave: {
      executor: 'ramping-vus',
      stages: [
        { duration: '30s', target: 5 },    // ramp to 5 concurrent submitters
        { duration: '2m',  target: 5 },    // hold — 5 submissions in-flight
        { duration: '30s', target: 10 },   // spike to 10
        { duration: '2m',  target: 10 },   // hold
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    'http_req_duration{step:initiate}': ['p95<3000'],
    'http_req_duration{step:complete}': ['p95<3000'],
    'http_req_failed': ['rate<0.05'],
  },
};

export default function () {
  const idx = __VU % CONFIG.USERS.length;
  const user = CONFIG.USERS[idx];
  const entryId = CONFIG.ENTRY_IDS[idx];

  const token = login(CONFIG.BASE_URL, user.email, user.password);
  const fileBytes = zhviFile[0];

  const subId = submitFile(
    CONFIG.BASE_URL, token, entryId,
    CONFIG.ZHVI_TASK_ID, CONFIG.ZHVI_PHASE_ID,
    'submission.csv', fileBytes, 'text/csv'
  );

  if (subId) {
    // Poll submission status (max 30s)
    let done = false;
    for (let i = 0; i < 30; i++) {
      sleep(1);
      const r = http.get(`${CONFIG.BASE_URL}/api/v1/submissions/${subId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const status = r.json('status');
      if (status === 'done' || status === 'failed') {
        done = true;
        check(r, { 'submission done': () => status === 'done' });
        break;
      }
    }
    if (!done) {
      console.warn(`Submission ${subId} not done after 30s`);
    }
  }

  sleep(5);  // Wait before next submission
}
```

**Metrics quan trọng:**
- Thời gian từ `complete` đến status `done` (end-to-end judging latency)
- Queue depth tăng không? (xem Redis)
- Có submission nào stuck ở `queued` quá lâu không?

---

## Kịch bản C — Submit Wave Sudoku (file 12MB, judge chậm)

**Mục đích:** Test queue backlog khi judge chậm + upload file lớn.

**File:** `load-tests/k6/04-submit-wave-sudoku.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { CONFIG } from './config.js';
import { login, submitFile } from './helpers.js';

const sudokuFile = new SharedArray('sudoku', function () {
  return [open('../../fixtures/submission_sudoku.zip', 'b')];
});

export const options = {
  scenarios: {
    submit_wave: {
      executor: 'constant-vus',
      vus: 5,
      duration: '3m',
    },
  },
  thresholds: {
    'http_req_duration{step:upload}': ['p95<30000'],  // 12MB upload, generous timeout
    'http_req_failed': ['rate<0.05'],
  },
};

export default function () {
  const idx = __VU % CONFIG.USERS.length;
  const user = CONFIG.USERS[idx];
  const entryId = CONFIG.ENTRY_IDS[idx];

  const token = login(CONFIG.BASE_URL, user.email, user.password);
  const fileBytes = sudokuFile[0];

  console.log(`VU ${__VU}: uploading Sudoku submission (12MB)`);

  const subId = submitFile(
    CONFIG.BASE_URL, token, entryId,
    CONFIG.SUDOKU_TASK_ID, CONFIG.SUDOKU_PHASE_ID,
    'submission.zip', fileBytes, 'application/zip'
  );

  if (subId) {
    // Sudoku judge takes 2-5s — poll up to 60s
    let done = false;
    for (let i = 0; i < 60; i++) {
      sleep(1);
      const r = http.get(`${CONFIG.BASE_URL}/api/v1/submissions/${subId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const status = r.json('status');
      if (status === 'done' || status === 'failed') {
        done = true;
        check(r, { 'sudoku done': () => status === 'done' });
        console.log(`Submission ${subId} finished with status: ${status}`);
        break;
      }
    }
  }

  sleep(10);
}
```

**Metrics quan trọng:**
- Upload time cho 12MB file (p95 < 30s là chấp nhận được)
- Queue depth: với 5 concurrent, queue sẽ tích 5 jobs × 2-5s = 10-25s backlog
- Với 1 worker: max throughput = ~20 submissions/phút

---

## Kịch bản D — Mixed Realistic Load

**Mục đích:** Simulate contest thực tế — nhiều người xem, ít người submit.

**File:** `load-tests/k6/05-mixed-realistic.js`

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { CONFIG } from './config.js';
import { login, submitFile } from './helpers.js';

const zhviFile = new SharedArray('zhvi', function () {
  return [open('../../fixtures/submission_zhvi.csv', 'b')];
});

export const options = {
  scenarios: {
    // 80% viewers: chỉ đọc
    viewers: {
      executor: 'constant-vus',
      vus: 40,
      duration: '5m',
      exec: 'viewerBehavior',
    },
    // 20% submitters: nộp bài
    submitters: {
      executor: 'constant-vus',
      vus: 10,
      duration: '5m',
      exec: 'submitterBehavior',
    },
  },
  thresholds: {
    'http_req_duration{group:read}':   ['p95<2000'],
    'http_req_duration{group:submit}': ['p95<5000'],
    'http_req_failed':                 ['rate<0.02'],
  },
};

export function viewerBehavior() {
  const user = CONFIG.USERS[__VU % CONFIG.USERS.length];
  const token = login(CONFIG.BASE_URL, user.email, user.password);
  const auth = { headers: { Authorization: `Bearer ${token}` }, tags: { group: 'read' } };

  http.get(`${CONFIG.BASE_URL}/api/v1/contests`, auth);
  sleep(2);
  http.get(`${CONFIG.BASE_URL}/api/v1/contests/${CONFIG.CONTEST_ID}/tasks`, auth);
  sleep(3);
  http.get(`${CONFIG.BASE_URL}/api/v1/leaderboards/contest/${CONFIG.CONTEST_ID}`, auth);
  sleep(Math.random() * 5 + 2);
}

export function submitterBehavior() {
  const idx = __VU % CONFIG.USERS.length;
  const user = CONFIG.USERS[idx];
  const entryId = CONFIG.ENTRY_IDS[idx];
  const token = login(CONFIG.BASE_URL, user.email, user.password);

  const subId = submitFile(
    CONFIG.BASE_URL, token, entryId,
    CONFIG.ZHVI_TASK_ID, CONFIG.ZHVI_PHASE_ID,
    'submission.csv', zhviFile[0], 'text/csv',
  );

  // Wait for result
  if (subId) {
    for (let i = 0; i < 30; i++) {
      sleep(1);
      const r = http.get(`${CONFIG.BASE_URL}/api/v1/submissions/${subId}`, {
        headers: { Authorization: `Bearer ${token}` }, tags: { group: 'submit' },
      });
      if (['done','failed'].includes(r.json('status'))) break;
    }
  }

  sleep(30);  // submitters không spam — nghỉ 30s trước submission tiếp theo
}
```

## Chạy tất cả và lưu kết quả

```bash
# A - Read load
k6 run load-tests/k6/02-read-load.js --out json=load-tests/results/read-load.json

# B - ZHVI wave
k6 run load-tests/k6/03-submit-wave-zhvi.js --out json=load-tests/results/submit-zhvi.json

# C - Sudoku wave (cẩn thận: tốn tài nguyên worker)
k6 run load-tests/k6/04-submit-wave-sudoku.js --out json=load-tests/results/submit-sudoku.json

# D - Mixed realistic
k6 run load-tests/k6/05-mixed-realistic.js --out json=load-tests/results/mixed-realistic.json
```

## Checklist

- [ ] Viết `helpers.js`
- [ ] Điền đủ UUIDs trong `config.js`
- [ ] Test scenario A (read load)
- [ ] Test scenario B (ZHVI wave)
- [ ] Test scenario C (Sudoku wave)
- [ ] Test scenario D (mixed)
- [ ] Lưu kết quả JSON cho phase 04 analysis
