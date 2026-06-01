/**
 * Mixed Realistic: 30 readers + 6 submitters chạy song song
 * Giống contest thực tế: nhiều người xem, ít người nộp
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { CONFIG } from './config.js';
import { login, authHeaders, submitFile, waitForResult } from './helpers.js';

const zhviBytes = new SharedArray('zhvi', function () {
  return [open('../fixtures/submission_zhvi.csv', 'b')];
});

export const options = {
  scenarios: {
    readers: {
      executor: 'constant-vus',
      vus: 30,
      duration: '5m',
      exec: 'readerFlow',
    },
    submitters: {
      executor: 'constant-vus',
      vus: 6,
      duration: '5m',
      exec: 'submitterFlow',
    },
  },
  thresholds: {
    'http_req_failed':                         ['rate<0.02'],
    'http_req_duration{endpoint:contests}':    ['p(95)<500'],
    'http_req_duration{endpoint:tasks}':       ['p(95)<800'],
    'http_req_duration{step:initiate}':        ['p(95)<3000'],
  },
};

export function readerFlow() {
  const idx = (__VU - 1) % CONFIG.USERS.length;
  const token = login(CONFIG.BASE_URL, CONFIG.USERS[idx].email, CONFIG.USERS[idx].password);
  const auth = authHeaders(token);

  http.get(`${CONFIG.BASE_URL}/api/v1/contests`,
    { ...auth, tags: { endpoint: 'contests' } });
  sleep(1);

  http.get(`${CONFIG.BASE_URL}/api/v1/contests/${CONFIG.CONTEST_ID}/tasks`,
    { ...auth, tags: { endpoint: 'tasks' } });
  sleep(2);

  http.get(`${CONFIG.BASE_URL}/api/v1/entries/${CONFIG.ENTRY_IDS[idx]}/submissions`,
    { ...auth, tags: { endpoint: 'submissions' } });
  sleep(Math.random() * 3 + 2);
}

export function submitterFlow() {
  const idx = (__VU - 1) % CONFIG.USERS.length;
  const user = CONFIG.USERS[idx];
  const entryId = CONFIG.ENTRY_IDS[idx];

  const token = login(CONFIG.BASE_URL, user.email, user.password);

  const subId = submitFile(
    CONFIG.BASE_URL, token, entryId,
    CONFIG.ZHVI_TASK_ID, CONFIG.ZHVI_PHASE_ID,
    'submission.csv', zhviBytes[0], 'text/csv',
  );

  if (subId) {
    const result = waitForResult(CONFIG.BASE_URL, token, subId, 30);
    check(result, { 'mixed: judged': (r) => r.status === 'done' });
  }

  sleep(30); // submitters không spam
}
