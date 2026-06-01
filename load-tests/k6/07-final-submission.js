/**
 * Final Submission Load Test
 *
 * Mục đích: Đo end-to-end judge time thực cho final phase (có chạy infer.py).
 * Chạy sequential (ít VUs) để đo timing chính xác, không tạo queue backlog.
 *
 * Kết quả cần quan sát:
 *   - ZHVI final: infer.py (dict lookup) + BLEU → dự kiến <5s
 *   - Sudoku final: infer.py (PIL reconstruct 1140 ảnh) + SSIM → dự kiến 30-120s
 *   - Thực tế vs lý thuyết → số để tính workers cần thiết
 */
import { check, sleep } from 'k6';
import { Trend, Counter } from 'k6/metrics';
import { CONFIG } from './config.js';
import { login, submitFile, waitForResult } from './helpers.js';

// Custom metrics để track judge time
const judgeDuration = new Trend('judge_duration_ms', true);
const judgeSuccess  = new Counter('judge_success_total');
const judgeFailed   = new Counter('judge_failed_total');

// Binary files: open per-VU (không dùng SharedArray cho binary)
const zhviFinalBytes   = open('../fixtures/final_submission_zhvi.zip', 'b');
const sudokuFinalBytes = open('../fixtures/final_submission_sudoku.zip', 'b');

export const options = {
  scenarios: {
    // 1 VU × 3 iterations: đo ZHVI final timing
    zhvi_final: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 3,
      exec: 'zhviFinalFlow',
      startTime: '0s',
    },
    // 1 VU × 2 iterations: đo Sudoku final timing (chậm hơn)
    sudoku_final: {
      executor: 'per-vu-iterations',
      vus: 1,
      iterations: 2,
      exec: 'sudokuFinalFlow',
      startTime: '30s',  // chờ ZHVI xong để không tranh worker
    },
  },
  thresholds: {
    'http_req_failed':    ['rate<0.05'],
    'judge_duration_ms':  ['p(95)<300000'],  // 5 phút max
  },
};

export function zhviFinalFlow() {
  const user   = CONFIG.USERS[0];
  const entry  = CONFIG.ENTRY_IDS[0];
  const token  = login(CONFIG.BASE_URL, user.email, user.password);
  const start  = Date.now();

  console.log(`[ZHVI-final] Submitting...`);

  const subId = submitFile(
    CONFIG.BASE_URL, token, entry,
    CONFIG.ZHVI_TASK_ID,
    '85ffa7c1-afea-4535-a525-641fd04236bf',  // d-ch-thu-t-hoa-vi-t-final_public
    'final_submission.zip', zhviFinalBytes, 'application/zip',
  );

  if (!subId) {
    judgeFailed.add(1);
    console.error('[ZHVI-final] submitFile failed');
    return;
  }

  // Poll tối đa 10 phút
  const result = waitForResult(CONFIG.BASE_URL, token, subId, 600);
  const elapsed = Date.now() - start;

  judgeDuration.add(elapsed);
  check(result, { 'zhvi-final done': (r) => r.status === 'done' });

  if (result.status === 'done') {
    judgeSuccess.add(1);
    console.log(`[ZHVI-final] sub=${subId} DONE in ${(elapsed/1000).toFixed(1)}s | score=${result.score}`);
  } else {
    judgeFailed.add(1);
    console.error(`[ZHVI-final] sub=${subId} ${result.status} after ${(elapsed/1000).toFixed(1)}s`);
  }

  sleep(5);
}

export function sudokuFinalFlow() {
  const user   = CONFIG.USERS[1];
  const entry  = CONFIG.ENTRY_IDS[1];
  const token  = login(CONFIG.BASE_URL, user.email, user.password);
  const start  = Date.now();

  console.log(`[Sudoku-final] Submitting (may take 30-120s)...`);

  const subId = submitFile(
    CONFIG.BASE_URL, token, entry,
    CONFIG.SUDOKU_TASK_ID,
    '11c99aa0-c9f0-4a71-b6ce-07d8bbf22765',  // sudoku-final_public-0522
    'final_submission.zip', sudokuFinalBytes, 'application/zip',
  );

  if (!subId) {
    judgeFailed.add(1);
    console.error('[Sudoku-final] submitFile failed');
    return;
  }

  // Poll tối đa 10 phút
  const result = waitForResult(CONFIG.BASE_URL, token, subId, 600);
  const elapsed = Date.now() - start;

  judgeDuration.add(elapsed);
  check(result, { 'sudoku-final done': (r) => r.status === 'done' });

  if (result.status === 'done') {
    judgeSuccess.add(1);
    console.log(`[Sudoku-final] sub=${subId} DONE in ${(elapsed/1000).toFixed(1)}s | score=${result.score}`);
  } else {
    judgeFailed.add(1);
    console.error(`[Sudoku-final] sub=${subId} ${result.status} after ${(elapsed/1000).toFixed(1)}s`);
  }

  sleep(5);
}
