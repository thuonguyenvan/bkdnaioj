# Phase 09 — Admin Judge Queue Monitor Page

**Priority:** Medium
**Status:** Pending
**Ref:** `stitch/admin-dashboard.html`
**API:** `GET /api/v1/admin/*`, WebSocket `/ws` (judge queue live feed)

---

## Overview

Implement admin judge queue page matching `stitch/admin-dashboard.html`. Role-gated (admin only). Shows live submission judging queue with auto-scrolling log, status badges, and queue metrics. Uses AdminSidebarLayout.

---

## UI Breakdown (from stitch/admin-dashboard.html)

### Admin Sidebar
```
[OLPAI logo]
[Contest: AI Master Cup]  secondary, truncate
─────────────────
[📊 Judge Queue]      ← active
[📋 Submissions]
[👥 Participants]
[📢 Announcements]
[❓ Clarifications]
[⚙️  Settings]
─────────────────
[Admin: username]  bottom
```

### Main: Judge Queue Monitor

**Header bar:**
```
[Judge Queue Monitor]  headline-md
[● 3 Workers Active]  green pulse  [Pause Queue btn]  [Settings btn]
```

**Stats row (4 cards):**
```
[🔄 12 Queued] [⏳ 3 Running] [✅ 847 Judged Today] [❌ 14 Errors]
```

**Active Jobs table:**
```
Job ID    | Team         | Task      | Phase  | Status   | Progress | Time
#J-9921   | Team_Alpha   | Task A    | Dev    | Running  | ████░ 80%| 2.3s
#J-9920   | NeuralStorm  | Task B    | Dev    | Running  | ███░░ 60%| 1.8s
```
- Job ID: `data-mono`, `text-primary`
- Progress: inline `ProgressBar` with glow animation

**Log Stream (below table):**
```
[Follow Tail toggle]
───────────────────────────────────────────
[12:45:31] #J-9921  RUNNING   score=0.847 ...
[12:45:29] #J-9920  ACCEPTED  score=0.923 ...
[12:45:28] #J-9919  ERROR     timeout after 300s
───────────────────────────────────────────
```
- Log lines: `data-mono` font, `text-on-surface-variant`
- Auto-scroll to bottom when "Follow Tail" active
- Color-coded: green=ACCEPTED, red=ERROR, cyan=RUNNING

---

## API Integration

```ts
// GET /api/v1/admin/judge-queue  → active jobs
interface JudgeJob {
  id: string; submission_id: string
  team_name: string; task_title: string; phase_name: string
  status: 'queued' | 'running' | 'accepted' | 'error'
  progress: number  // 0-100
  elapsed_seconds: number
}

// WebSocket /ws  → server-sent events for queue updates + log lines
// POST /api/v1/admin/judge-queue/pause
// POST /api/v1/admin/judge-queue/resume
```

---

## Files to Create

```
src/pages/admin/
└── admin-judge-queue-monitor-page.tsx

src/components/admin/
├── admin-judge-queue-stats-row.tsx         # 4 stat cards: queued/running/judged/errors
├── admin-active-jobs-table.tsx             # table with inline progress bars
├── admin-log-stream-viewer.tsx             # scrollable log with follow-tail
├── admin-log-line.tsx                      # single log entry with color coding
└── admin-queue-control-bar.tsx             # pause/resume + worker status
```

---

## Implementation Steps

1. Create `admin-judge-queue-monitor-page.tsx` (requires `role=admin`)
2. `AdminQueueControlBar`: fetch worker status, Pause/Resume button
3. `AdminJudgeQueueStatsRow`: 4 cards, poll every 10s
4. `AdminActiveJobsTable`:
   - Poll every 3s for active jobs
   - Inline `ProgressBar` per job with `animate-pulse` glow when running
   - Elapsed time formatted as `Xs`
5. `AdminLogStreamViewer`:
   - WebSocket connection to `/ws` for log lines
   - Fallback: poll `GET /api/v1/admin/judge-queue/logs?since=` every 2s
   - "Follow Tail" toggle: `useEffect` auto-scrolls `ref.current.scrollTop = scrollHeight`
   - Color-code log lines by status keyword
6. Log line color logic:
   ```ts
   const logLineColor = (line: string) => {
     if (line.includes('ACCEPTED')) return 'text-green-400'
     if (line.includes('ERROR'))    return 'text-error'
     if (line.includes('RUNNING'))  return 'text-secondary'
     return 'text-on-surface-variant'
   }
   ```

---

## Success Criteria

- [ ] Page only accessible to admin role
- [ ] Active jobs table updates every 3s
- [ ] Progress bars show live progress with glow animation
- [ ] Log stream auto-scrolls when "Follow Tail" active
- [ ] Log lines color-coded by status
- [ ] Pause/Resume queue works
- [ ] Worker count displays correctly
