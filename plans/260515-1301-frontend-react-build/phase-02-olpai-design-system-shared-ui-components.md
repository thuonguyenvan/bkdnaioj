# Phase 02 — OLPAI Design System & Shared UI Components

**Priority:** Critical (blocks all page phases)
**Status:** Pending
**Ref:** `stitch/*.html` — all screens use same token set

---

## Overview

Build reusable component library matching Stitch design exactly. All components are pure Tailwind + React — no UI library dependency. Components mirror patterns found across the 6 HTML screens.

---

## Component Inventory (from Stitch HTML analysis)

### Atoms
| Component | Used in | Key classes |
|---|---|---|
| `Button` | All screens | primary `bg-primary-container`, outline, ghost variants; indigo glow on hover |
| `Badge` / `StatusBadge` | admin-dashboard, contest-detail | 10% opacity bg + solid dot indicator (6px) |
| `Avatar` | clarifications, leaderboard | rounded-full, initials fallback |
| `Spinner` | submission-page, admin-dashboard | animate-spin indigo |
| `ProgressBar` | admin-dashboard (judge queue) | 4px track, glowing cyan/indigo fill, pulse animation |
| `Tooltip` | leaderboard scores | absolute positioned, surface-container-highest bg |

### Molecules
| Component | Used in |
|---|---|
| `StatCard` | homepage (4 stats), admin-dashboard |
| `ContestCard` | homepage contest list |
| `TaskListItem` | contest-detail sidebar |
| `SubmissionStatusRow` | submission-page recent submissions, admin judge queue |
| `LeaderboardRow` | leaderboard (top-3 gold/silver/bronze tint, data-mono rank) |
| `ClarificationMessage` | clarifications page (bubble layout) |
| `AnnouncementItem` | contest-detail announcements tab |
| `FileDropzone` | submission-page drag-and-drop |

### Organisms
| Component | Used in |
|---|---|
| `ContestSidebar` | contest-detail, clarifications, admin-dashboard (left nav 64px wide) |
| `TopNavbar` | homepage, contest-detail, submission-page, leaderboard |
| `DataTable` | leaderboard, admin judge queue |
| `TabBar` | contest-detail (Overview/Tasks/Leaderboard/Announcements), leaderboard (Overall/Task A/B/C) |

---

## Status Badge Variants (from Stitch)

```tsx
// Submission statuses
type SubmissionStatus = 'accepted' | 'wrong_answer' | 'pending' | 'running' | 'error' | 'time_limit'

const statusConfig = {
  accepted:    { label: 'Accepted',     bg: 'bg-green-500/10',  text: 'text-green-400',  dot: 'bg-green-400' },
  wrong_answer:{ label: 'Wrong Answer', bg: 'bg-error/10',      text: 'text-error',      dot: 'bg-error' },
  pending:     { label: 'Pending',      bg: 'bg-outline/10',    text: 'text-on-surface-variant', dot: 'bg-outline' },
  running:     { label: 'Running',      bg: 'bg-secondary/10',  text: 'text-secondary',  dot: 'bg-secondary animate-pulse' },
  error:       { label: 'Error',        bg: 'bg-error/10',      text: 'text-error',      dot: 'bg-error' },
  time_limit:  { label: 'Time Limit',   bg: 'bg-tertiary/10',   text: 'text-tertiary',   dot: 'bg-tertiary' },
}
```

---

## Files to Create

```
src/
├── components/
│   ├── ui/
│   │   ├── button.tsx
│   │   ├── status-badge.tsx
│   │   ├── progress-bar-with-glow-animation.tsx
│   │   ├── avatar-with-initials-fallback.tsx
│   │   ├── spinner.tsx
│   │   ├── tooltip.tsx
│   │   ├── tab-bar.tsx
│   │   └── data-table-with-sortable-columns.tsx
│   ├── contest/
│   │   ├── contest-card.tsx
│   │   ├── task-list-sidebar-item.tsx
│   │   └── submission-status-row.tsx
│   ├── leaderboard/
│   │   └── leaderboard-row-with-rank-highlight.tsx
│   ├── clarification/
│   │   └── clarification-message-bubble.tsx
│   └── shared/
│       ├── stat-card.tsx
│       ├── file-dropzone-with-drag-drop.tsx
│       └── announcement-item.tsx
└── lib/
    └── cn.ts    # clsx + twMerge utility
```

---

## Implementation Steps

1. Install `clsx` + `tailwind-merge`: `npm install clsx tailwind-merge`
2. Create `lib/cn.ts` — standard `cn()` helper
3. Build atoms first (Button → Badge → Avatar → Spinner → ProgressBar)
4. Build molecules (StatCard, ContestCard, SubmissionStatusRow, LeaderboardRow)
5. Build FileDropzone with `dragover`/`drop` events + file type validation (`.zip`, `.csv`, `.json`)
6. Verify glow effect on primary buttons:
   ```css
   .btn-primary:hover { box-shadow: 0 0 12px rgba(79,70,229,0.35); }
   ```
7. ProgressBar: pulse animation for `running` state via Tailwind `animate-pulse`

---

## Success Criteria

- [ ] All atoms render correctly in isolation
- [ ] StatusBadge shows correct color + dot for all 6 states
- [ ] LeaderboardRow renders gold/silver/bronze tints for rank 1/2/3
- [ ] ProgressBar pulses when status = running
- [ ] FileDropzone accepts drag-and-drop + click-to-browse
- [ ] All components use `data-mono` font for numeric values
