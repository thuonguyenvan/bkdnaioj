import http from "k6/http";
import { check, sleep } from "k6";

const baseURL = (__ENV.API_BASE_URL || "https://api.bkdnaioj.app").replace(/\/$/, "");
const contestID = __ENV.CONTEST_ID;
const duration = __ENV.DURATION || "60s";
const targetVUs = Number(__ENV.TARGET_VUS || "50");
const tokens = JSON.parse(__ENV.TOKENS_JSON || "[]");
const entryIDs = JSON.parse(__ENV.ENTRY_IDS_JSON || "[]");

if (!contestID || tokens.length === 0 || entryIDs.length === 0) {
  throw new Error("CONTEST_ID, TOKENS_JSON and ENTRY_IDS_JSON are required");
}

export const options = {
  scenarios: {
    authenticated_reads: {
      executor: "constant-vus",
      vus: targetVUs,
      duration,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    "http_req_duration{endpoint:contests}": ["p(95)<500"],
    "http_req_duration{endpoint:tasks}": ["p(95)<800"],
    "http_req_duration{endpoint:submissions}": ["p(95)<1000"],
  },
  summaryTrendStats: ["avg", "med", "p(90)", "p(95)", "p(99)", "max"],
};

export default function () {
  const index = (__VU - 1) % tokens.length;
  const params = {
    headers: {
      Authorization: `Bearer ${tokens[index]}`,
      "Content-Type": "application/json",
    },
  };

  const contests = http.get(`${baseURL}/api/v1/contests`, {
    ...params,
    tags: { endpoint: "contests" },
  });
  check(contests, { "contests status 200": (response) => response.status === 200 });

  const tasks = http.get(`${baseURL}/api/v1/contests/${contestID}/tasks`, {
    ...params,
    tags: { endpoint: "tasks" },
  });
  check(tasks, { "tasks status 200": (response) => response.status === 200 });

  const submissions = http.get(`${baseURL}/api/v1/entries/${entryIDs[index]}/submissions`, {
    ...params,
    tags: { endpoint: "submissions" },
  });
  check(submissions, { "submissions status 200": (response) => response.status === 200 });

  sleep(1);
}
