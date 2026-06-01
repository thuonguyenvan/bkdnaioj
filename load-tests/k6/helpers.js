import http from 'k6/http';
import { check, sleep } from 'k6';

export function login(baseURL, email, password) {
  const r = http.post(
    `${baseURL}/api/v1/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' }, tags: { step: 'login' } },
  );
  check(r, { 'login 200': (r) => r.status === 200 });
  // token field is {access_token: '...'}
  const t = r.json('token');
  return (t && t.access_token) ? t.access_token : '';
}

export function authHeaders(token) {
  return { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}

// Full 3-step submission flow: initiate → upload → complete
// Returns submission_id or null on failure
export function submitFile(baseURL, token, entryId, taskId, phaseId, filename, fileBytes, contentType) {
  const auth = authHeaders(token);

  // Step 1: Initiate
  // byteLength for ArrayBuffer, length for string
  const sizeBytes = fileBytes.byteLength !== undefined ? fileBytes.byteLength : fileBytes.length;
  const initiateBody = JSON.stringify({
    task_id:  taskId,
    phase_id: phaseId,
    files: [{ filename, content_type: contentType, size_bytes: sizeBytes }],
  });
  const initRes = http.post(
    `${baseURL}/api/v1/entries/${entryId}/submissions:initiate`,
    initiateBody,
    { ...auth, tags: { step: 'initiate' } },
  );
  check(initRes, { 'initiate 201': (r) => r.status === 201 });
  if (initRes.status !== 201) return null;

  // Response: { submission_id, uploads: [{filename, object_key, put_url}] }
  const sub = initRes.json();
  const submissionId = sub.submission_id;
  const upload = sub.uploads && sub.uploads[0];
  if (!submissionId || !upload) return null;

  // Step 2: Upload to MinIO presigned URL
  const uploadRes = http.put(upload.put_url, fileBytes, {
    headers: { 'Content-Type': contentType },
    tags: { step: 'upload' },
  });
  check(uploadRes, { 'upload 2xx': (r) => r.status >= 200 && r.status < 300 });

  // Step 3: Complete — triggers judge
  // POST /api/v1/submissions/:id/complete  body: { files: [{filename, object_key, size_bytes, content_type}] }
  const completeBody = JSON.stringify({
    files: [{
      filename,
      object_key: upload.object_key,
      size_bytes: sizeBytes,
      content_type: contentType,
    }],
  });
  const completeRes = http.post(
    `${baseURL}/api/v1/submissions/${submissionId}/complete`,
    completeBody,
    { ...auth, tags: { step: 'complete' } },
  );
  check(completeRes, { 'complete 200': (r) => r.status === 200 });

  return submissionId;
}

// Poll submission until done/failed or timeout
export function waitForResult(baseURL, token, subId, timeoutSecs) {
  const auth = authHeaders(token);
  for (let i = 0; i < timeoutSecs; i++) {
    const r = http.get(
      `${baseURL}/api/v1/submissions/${subId}`,
      { ...auth, tags: { step: 'poll' } },
    );
    const body = r.json();
    const status = body && body.status;
    if (status === 'done' || status === 'failed') {
      return { status, score: body.display_score };
    }
    sleep(1);
  }
  return { status: 'timeout' };
}
