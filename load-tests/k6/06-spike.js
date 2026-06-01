/**
 * Spike Test: đột ngột 30 submitters cùng lúc → tìm breaking point
 * Quan sát: API có crash không? Queue có backlog không? Error rate bao nhiêu?
 */
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { CONFIG } from './config.js';
import { login, submitFile, waitForResult } from './helpers.js';

// CSV: text mode (SharedArray works for text)
const zhviBytes = new SharedArray('zhvi', function () {
  return [open('../fixtures/submission_zhvi.csv')];
});

export const options = {
  stages: [
    { duration: '10s', target: 5  },
    { duration: '5s',  target: 30 },  // spike đột ngột
    { duration: '1m',  target: 30 },  // giữ spike
    { duration: '10s', target: 5  },  // drop xuống
    { duration: '30s', target: 5  },  // observe recovery
  ],
  thresholds: {
    'http_req_failed':             ['rate<0.05'],
    'http_req_duration{step:initiate}': ['p(95)<5000'],
  },
};

export default function () {
  const idx = (__VU - 1) % CONFIG.USERS.length;
  const token = login(CONFIG.BASE_URL, CONFIG.USERS[idx].email, CONFIG.USERS[idx].password);

  const subId = submitFile(
    CONFIG.BASE_URL, token, CONFIG.ENTRY_IDS[idx],
    CONFIG.ZHVI_TASK_ID, CONFIG.ZHVI_PHASE_ID,
    'submission.csv', zhviBytes[0], 'text/csv',
  );

  if (subId) {
    // Poll max 60s — spike sẽ tạo queue backlog, judging sẽ chậm hơn
    const result = waitForResult(CONFIG.BASE_URL, token, subId, 60);
    check(result, { 'spike: judged': (r) => r.status === 'done' });
    console.log(`[VU${__VU}] spike sub=${subId} → ${result.status} score=${result.score}`);
  }

  sleep(2);
}
