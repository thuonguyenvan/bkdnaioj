/**
 * k6 Leaderboard Benchmark
 *
 * Inject submissions → trigger leaderboard recompute → đọc metrics từ Prometheus
 *
 * Cách chạy:
 *   k6 run demo/k6_leaderboard_bench.js
 *   k6 run --env STRATEGY=cost demo/k6_leaderboard_bench.js
 *
 * Sau khi chạy xong, đọc Prometheus:
 *   python demo/leaderboard_benchmark.py --api http://localhost:8080
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Trend, Counter, Rate } from "k6/metrics";

// ── Custom metrics (k6 side — bổ sung cho Prometheus) ─────────────────────
const submissionLatency = new Trend("submission_api_latency_ms");
const submissionErrors  = new Counter("submission_errors");
const submissionSuccess = new Rate("submission_success_rate");

// ── Config ─────────────────────────────────────────────────────────────────
const API      = __ENV.API      || "http://localhost:8080";
const STRATEGY = __ENV.STRATEGY || "fifo"; // "fifo" | "cost"

// Test data — lấy từ make seed
const ACCOUNTS = [
  { email: "sv001@bkdn.edu.vn", entry_id: "7e0c8dd2-4a2a-4d78-8982-150327a2101b" },
  { email: "sv002@bkdn.edu.vn", entry_id: "22f9f517-610e-40cc-87d7-cc54cc887f5d" },
  { email: "sv003@bkdn.edu.vn", entry_id: "09eb3777-c487-4f23-92da-b171dc1f87a6" },
  { email: "sv004@bkdn.edu.vn", entry_id: "c624ca74-16e6-4652-b51b-9fb9efefa021" },
  { email: "sv005@bkdn.edu.vn", entry_id: "d393b489-d63e-44a5-a414-32e779ad1bf7" },
];

// Task/Phase IDs từ seeded data
const TASK_ID  = __ENV.TASK_ID  || "5aeaea30-0409-4414-8758-f802fe261ae0";
const PHASE_ID = __ENV.PHASE_ID || "5c9d3f96-83c8-49fb-a43a-bc3b8c0f442f";

// ── k6 scenario ────────────────────────────────────────────────────────────
export const options = {
  scenarios: {
    leaderboard_stress: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "30s", target: 5  },  // ramp up: 5 concurrent users
        { duration: "60s", target: 10 },  // hold: 10 concurrent
        { duration: "30s", target: 0  },  // ramp down
      ],
    },
  },
  thresholds: {
    // API submission phải respond < 2s (p95)
    "submission_api_latency_ms": ["p(95)<2000"],
    // Tỷ lệ thành công > 90%
    "submission_success_rate": ["rate>0.9"],
  },
};

// ── Setup: login tất cả accounts lấy token ─────────────────────────────────
export function setup() {
  const tokens = {};
  for (const acc of ACCOUNTS) {
    const resp = http.post(
      `${API}/api/v1/auth/login`,
      JSON.stringify({ email: acc.email, password: "password" }),
      { headers: { "Content-Type": "application/json" } }
    );
    if (resp.status === 200) {
      const body = JSON.parse(resp.body);
      const tok  = body.token;
      tokens[acc.entry_id] = (typeof tok === "object") ? tok.access_token : tok;
    }
  }
  console.log(`✓ Logged in ${Object.keys(tokens).length} accounts`);
  return { tokens };
}

// ── Main VU function ────────────────────────────────────────────────────────
export default function (data) {
  // Mỗi VU dùng 1 account theo round-robin
  const idx  = (__VU - 1) % ACCOUNTS.length;
  const acc  = ACCOUNTS[idx];
  const token = data.tokens[acc.entry_id];
  if (!token) return;

  const headers = {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };

  // Step 1: Initiate submission upload
  const initiatePayload = JSON.stringify({
    task_id:  TASK_ID,
    phase_id: PHASE_ID,
    files: [{ filename: "predictions.csv", size: 1024 }],
  });

  const t0     = Date.now();
  const initR  = http.post(
    `${API}/api/v1/entries/${acc.entry_id}/submissions:initiate`,
    initiatePayload,
    { headers }
  );
  submissionLatency.add(Date.now() - t0);

  const ok = check(initR, {
    "initiate status 200": (r) => r.status === 200,
  });
  submissionSuccess.add(ok ? 1 : 0);

  if (!ok) {
    submissionErrors.add(1);
    console.warn(`VU${__VU} initiate failed: ${initR.status} ${initR.body.substring(0,100)}`);
    sleep(1);
    return;
  }

  const initBody = JSON.parse(initR.body);
  const subID    = initBody.submission_id;
  const uploads  = initBody.uploads || [];

  // Step 2: Upload file (dùng presigned URL nếu có, hoặc skip)
  if (uploads.length > 0 && uploads[0].put_url) {
    const fakeCSV = "id,score\n1,0.95\n2,0.87\n";
    http.put(uploads[0].put_url, fakeCSV, {
      headers: { "Content-Type": "text/csv" },
    });
  }

  // Step 3: Complete submission → triggers worker → triggers leaderboard
  if (subID) {
    const completeR = http.post(
      `${API}/api/v1/submissions/${subID}/complete`,
      JSON.stringify({}),
      { headers }
    );
    check(completeR, {
      "complete status 200": (r) => r.status === 200,
    });
  }

  sleep(Math.random() * 2 + 0.5); // 0.5–2.5s giữa submissions
}

// ── Teardown: in summary ────────────────────────────────────────────────────
export function teardown() {
  console.log("\n✓ Benchmark done. Read Prometheus metrics:");
  console.log(`  curl -s ${API}/metrics | grep olpai_`);
  console.log("  python demo/leaderboard_benchmark.py --api " + API);
}
