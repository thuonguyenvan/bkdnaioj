/**
 * Submit Wave ZHVI: 6 users submit file 14KB đồng thời, poll kết quả
 * Judge <1s → dùng để test throughput pipeline
 */
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import http from 'k6/http';
import { CONFIG } from './config.js';
import { login, submitFile, waitForResult } from './helpers.js';

// CSV: text mode — k6 sends as string body directly
const zhviBytes = new SharedArray('zhvi', function () {
  return [open('../fixtures/submission_zhvi.csv')];
});

export const options = {
  stages: [
    { duration: '20s', target: 3 },
    { duration: '2m',  target: 6 },
    { duration: '1m',  target: 6 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    'http_req_failed':             ['rate<0.05'],
    'http_req_duration{step:initiate}': ['p(95)<3000'],
    'http_req_duration{step:upload}':   ['p(95)<5000'],
    'http_req_duration{step:complete}': ['p(95)<3000'],
  },
};

export default function () {
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
    check(result, { 'judged done': (r) => r.status === 'done' });
    console.log(`[VU${__VU}] ZHVI sub=${subId} → ${result.status} score=${result.score}`);
  }

  sleep(5);
}
