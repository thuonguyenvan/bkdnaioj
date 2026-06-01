/**
 * Spike Test: đột ngột 30 submitters cùng lúc → tìm breaking point
 */
import { check, sleep } from 'k6';
import { SharedArray } from 'k6/data';
import { CONFIG } from './config.js';
import { login, submitFile } from './helpers.js';

const zhviBytes = new SharedArray('zhvi', function () {
  return [open('../fixtures/submission_zhvi.csv', 'b')];
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
    'http_req_failed': ['rate<0.30'],  // accept up to 30% error during spike
  },
};

export default function () {
  const idx = (__VU - 1) % CONFIG.USERS.length;
  const token = login(CONFIG.BASE_URL, CONFIG.USERS[idx].email, CONFIG.USERS[idx].password);

  submitFile(
    CONFIG.BASE_URL, token, CONFIG.ENTRY_IDS[idx],
    CONFIG.ZHVI_TASK_ID, CONFIG.ZHVI_PHASE_ID,
    'submission.csv', zhviBytes[0], 'text/csv',
  );

  sleep(2);
}
