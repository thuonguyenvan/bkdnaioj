/**
 * Baseline: 1 VU, 10 iterations — xác nhận API hoạt động và ghi baseline latency
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { CONFIG } from './config.js';
import { login, authHeaders } from './helpers.js';

export const options = {
  vus: 1,
  iterations: 10,
  thresholds: {
    'http_req_failed':   ['rate==0'],
    'http_req_duration': ['p(95)<2000'],
  },
};

export default function () {
  // Health
  let r = http.get(`${CONFIG.BASE_URL}/healthz`);
  check(r, { 'healthz 200': (r) => r.status === 200 });

  // Contest list (public)
  r = http.get(`${CONFIG.BASE_URL}/api/v1/contests`);
  check(r, { 'contests 200': (r) => r.status === 200 });

  // Login
  const token = login(CONFIG.BASE_URL, CONFIG.USERS[0].email, CONFIG.USERS[0].password);
  const auth = authHeaders(token);

  // Tasks
  r = http.get(`${CONFIG.BASE_URL}/api/v1/contests/${CONFIG.CONTEST_ID}/tasks`, auth);
  check(r, { 'tasks 200': (r) => r.status === 200 });

  // Submissions list
  r = http.get(`${CONFIG.BASE_URL}/api/v1/entries/${CONFIG.ENTRY_IDS[0]}/submissions`, auth);
  check(r, { 'submissions 200': (r) => r.status === 200 });

  sleep(1);
}
