# Phase 05 — Contest Detail Page with Sidebar

**Priority:** High
**Status:** Pending
**Ref:** `stitch/contest-detail.html`
**API:** `GET /api/v1/contests/:id`, `GET /api/v1/contests/:id/tasks`, `GET /api/v1/contests/:id/phase-defs`

---

## Overview

Implement the contest detail page matching `stitch/contest-detail.html`. Uses `ContestSidebarLayout` from Phase 03. Page has tabbed content: Overview, Tasks, Leaderboard, Announcements.

---

## UI Breakdown (from stitch/contest-detail.html)

### Header Card (elevated, `#1A1A2E` bg, indigo glow shadow)
```
[OLPAI 2026 — Round 1]      display-lg
[AI Master Cup]              headline-md, secondary color
[LIVE]  [Practice Phase 01/04]  [847 Teams]  [3 Tasks]
[Start: May 12] → [End: Jun 30]   progress bar
[Join Contest btn]  [View Leaderboard btn]
```

### Tab Bar
```
[Overview] [Tasks ✓] [Leaderboard] [Announcements (3)]
```

### Overview Tab
- Description markdown rendered as HTML
- Evaluation metric explanation
- Schedule timeline

### Tasks Tab
```
[Task 1: Image Classification]  → click → ContestSidebarNav highlights
  Score: 0.847 / 1.000 (best submission shown)
  [Submit btn]
```

### Announcements Tab
- List of `AnnouncementItem` with timestamp

---

## API Integration

```ts
// GET /api/v1/contests/:id
interface ContestDetail extends Contest {
  description: string
  rules: string
}

// GET /api/v1/contests/:id/tasks
interface Task {
  id: string; title: string; description: string
  metric_name: string; metric_description: string
  submission_limit_per_day: number
}

// GET /api/v1/contests/:id/phase-defs
interface PhaseDef {
  id: string; name: string; phase_number: number
  starts_at: string; ends_at: string
}
```

---

## Files to Create

```
src/pages/
└── contest-detail-page.tsx

src/components/contest/
├── contest-header-card.tsx               # elevated card with contest info + CTA
├── contest-tab-bar.tsx                   # Overview/Tasks/Leaderboard/Announcements
├── contest-overview-tab-content.tsx      # description + schedule
├── contest-tasks-tab-content.tsx         # task list with scores
└── contest-announcements-tab-content.tsx # list of announcements
```

---

## Implementation Steps

1. Create `contest-detail-page.tsx`, fetch contest + tasks + phase-defs in parallel via `Promise.all`
2. Build `ContestHeaderCard`:
   - Progress bar = `(now - start) / (end - start) * 100%`
   - Render phase indicator: `Phase 01 / 04`
   - Show "Join Contest" if user not enrolled, "Enrolled" badge if enrolled
3. Build `ContestTabBar` — controlled by `activeTab` state, update URL hash
4. Tasks tab: map tasks to rows with best score from user's submissions
   - Score uses `data-mono` font
   - "Submit" button → navigates to `/contests/:id/tasks/:taskId/submit`
5. Announcements tab: `GET /api/v1/contests/:id/announcements` (if endpoint exists)
6. Handle enrollment: `POST /api/v1/contests/:id/entries`

---

## Success Criteria

- [ ] Contest header renders with correct data from API
- [ ] Tab switching works, correct content renders per tab
- [ ] Phase progress bar shows current phase position
- [ ] Tasks list shows best submission score per task
- [ ] "Join Contest" triggers enrollment API call
- [ ] ContestSidebarNav reflects current contest tasks
