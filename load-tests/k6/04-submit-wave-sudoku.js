/**
 * Submit Wave Sudoku: 6 users submit file 12MB đồng thời
 * Judge 2-5s → test queue backlog + upload bandwidth
 */
import { check, sleep } from 'k6';
import { CONFIG } from './config.js';
import { login, submitFile, waitForResult } from './helpers.js';

// Binary file: open per-VU (SharedArray loses ArrayBuffer data)
const sudokuBytes = open('../fixtures/submission_sudoku.zip', 'b');

export const options = {
  stages: [
    { duration: '20s', target: 3 },
    { duration: '3m',  target: 6 },
    { duration: '20s', target: 0 },
  ],
  thresholds: {
    'http_req_failed':             ['rate<0.05'],
    'http_req_duration{step:upload}': ['p(95)<60000'],  // 12MB upload, generous
  },
};

export default function () {
  const idx = (__VU - 1) % CONFIG.USERS.length;
  const user = CONFIG.USERS[idx];
  const entryId = CONFIG.ENTRY_IDS[idx];

  const token = login(CONFIG.BASE_URL, user.email, user.password);

  console.log(`[VU${__VU}] Uploading Sudoku (12MB)...`);

  const subId = submitFile(
    CONFIG.BASE_URL, token, entryId,
    CONFIG.SUDOKU_TASK_ID, CONFIG.SUDOKU_PHASE_ID,
    'submission.zip', sudokuBytes, 'application/zip',
  );

  if (subId) {
    const result = waitForResult(CONFIG.BASE_URL, token, subId, 60);
    check(result, { 'sudoku judged': (r) => r.status === 'done' });
    console.log(`[VU${__VU}] Sudoku sub=${subId} → ${result.status} score=${result.score}`);
  }

  sleep(10);
}
