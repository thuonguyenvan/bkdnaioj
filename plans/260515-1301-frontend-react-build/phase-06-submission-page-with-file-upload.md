# Phase 06 — Submission Page with File Upload

**Priority:** High
**Status:** Pending
**Ref:** `stitch/submission-page.html`
**API:** `POST /api/v1/submissions`, `GET /api/v1/tasks/:id`, S3 presigned upload

---

## Overview

Implement submission page matching `stitch/submission-page.html`. User uploads a file (zip/csv/json) for a specific task. Shows evaluation metric, recent submissions table with status badges.

---

## UI Breakdown (from stitch/submission-page.html)

### Header
```
[Submit — Task 1: Image Classification]  headline-md
[OLPAI 2026 — Round 1]                   body-sm, muted
[2 / 5 submissions today]                label-caps, secondary
```

### Main Layout (2-column on desktop)
**Left (60%):** Submission form
```
[Evaluation Metric box]
  Metric: Accuracy (0.0 – 1.0)
  Description: ...

[File Dropzone]
  Drag & drop your submission file
  .zip / .csv / .json  •  Max 500MB
  [Browse files btn]
  [Selected file chip with size]

[Notes textarea]  (optional)
[Submit btn]  — primary, full width
```

**Right (40%):** Recent submissions
```
[Recent Submissions]  headline-md
table:
  ID       | Submitted    | Score    | Status
  #S-00421 | 2m ago       | 0.847    | Accepted
  #S-00418 | 1h ago       | 0.821    | Wrong Answer
```
- ID: `data-mono`, right-aligned
- Score: `data-mono`, `text-secondary`
- Status: `StatusBadge`

---

## API Integration

```ts
// GET /api/v1/tasks/:taskId  → task detail + metric info

// Upload flow (S3 presigned):
// 1. POST /api/v1/submissions  → returns { upload_url, submission_id }
// 2. PUT upload_url (direct to S3 with file binary)
// 3. Poll GET /api/v1/submissions/:id until status != pending

// GET /api/v1/tasks/:taskId/submissions  (recent submissions)
interface Submission {
  id: string; created_at: string
  score: number | null; status: SubmissionStatus
  file_name: string; notes: string
}
```

---

## Files to Create

```
src/pages/
└── submission-page.tsx

src/components/submission/
├── submission-file-dropzone.tsx          # drag-drop + click-to-browse + file preview chip
├── submission-evaluation-metric-card.tsx # shows metric name + description
├── submission-recent-table.tsx           # table with StatusBadge + data-mono
└── submission-status-poller.tsx          # polls API until status resolves
```

---

## Implementation Steps

1. Create `submission-page.tsx`, fetch task detail on mount
2. `FileDropzone`:
   - Accept `.zip`, `.csv`, `.json` only
   - Show file name + size chip after selection
   - Error state for wrong file type
3. Submit flow:
   ```
   a. POST /api/v1/submissions (get presigned URL)
   b. PUT presigned URL (direct S3 upload with progress)
   c. Show progress bar during upload
   d. Poll every 3s until status resolves (max 2 min)
   ```
4. Upload progress: use `axios.put` with `onUploadProgress` → update `ProgressBar`
5. Recent submissions table: `useQuery` with `refetchInterval: 5000`
6. Daily limit display: parse from API header or submission list count
7. Notes field: optional textarea, max 500 chars

---

## Error Handling

- File too large → inline error under dropzone
- Daily limit exceeded → toast + disable submit button
- Upload failed → retry button
- Evaluation error → error status badge + error message tooltip

---

## Success Criteria

- [ ] File drag-and-drop works, correct file type validation
- [ ] Submission uploads to S3 via presigned URL
- [ ] Progress bar shows upload progress
- [ ] Status polls and updates automatically
- [ ] Recent submissions table refreshes every 5s
- [ ] Daily limit counter shows correctly
