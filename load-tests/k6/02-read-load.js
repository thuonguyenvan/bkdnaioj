/**
 * Read Load: ramp lên 50 concurrent readers, đo leaderboard + tasks + submissions
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { CONFIG } from './config.js';
import { login, authHeaders } from './helpers.js';

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m',  target: 30 },
    { duration: '2m',  target: 50 },
    { duration: '30s', target: 0  },
  ],
  thresholds: {
    'http_req_failed':                          ['rate<0.01'],
    'http_req_duration{endpoint:contests}':     ['p(95)<500'],
    'http_req_duration{endpoint:tasks}':        ['p(95)<800'],
    'http_req_duration{endpoint:submissions}':  ['p(95)<1000'],
  },
};

export default function () {
  const idx = (__VU - 1) % CONFIG.USERS.length;
  const token = login(CONFIG.BASE_URL, CONFIG.USERS[idx].email, CONFIG.USERS[idx].password);
  const auth = authHeaders(token);

  http.get(`${CONFIG.BASE_URL}/api/v1/contests`,
    { ...auth, tags: { endpoint: 'contests' } });

  sleep(0.5);

  http.get(`${CONFIG.BASE_URL}/api/v1/contests/${CONFIG.CONTEST_ID}/tasks`,
    { ...auth, tags: { endpoint: 'tasks' } });

  sleep(0.5);

  http.get(`${CONFIG.BASE_URL}/api/v1/entries/${CONFIG.ENTRY_IDS[idx]}/submissions`,
    { ...auth, tags: { endpoint: 'submissions' } });

  sleep(Math.random() * 2 + 1);
}
