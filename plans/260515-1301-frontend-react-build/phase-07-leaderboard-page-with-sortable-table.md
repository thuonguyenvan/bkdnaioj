# Phase 07 — Leaderboard Page with Sortable Table

**Priority:** Medium
**Status:** Pending
**Ref:** `stitch/leaderboard.html`
**API:** `GET /api/v1/contests/:contestId/leaderboard` (via `registerLeaderboards`)

---

## Overview

Implement leaderboard page matching `stitch/leaderboard.html`. Public page showing team rankings with per-task scores. Tab bar for Overall + per-task views. Top 3 rows have gold/silver/bronze tint.

---

## UI Breakdown (from stitch/leaderboard.html)

### Header
```
[Leaderboard — OLPAI 2026 Round 1]  headline-md
[Last updated: 2m ago]  •  [Frozen badge if frozen]
[Search teams input]  [Export CSV btn]
```

### Tab Bar
```
[Overall] [Task A] [Task B] [Task C]
```

### Leaderboard Table
```
Rank | Team               | Score    | Task A  | Task B  | Task C  | Submissions | Last Submit
 1   | Team_Alpha         | 2.847    | 0.921   | 0.947   | 0.979   |      14     | 2h ago
 2   | NeuralStorm        | 2.821    |  ...
 3   | DataMiners         | 2.764    |  ...
...  | (normal rows)
```
- Rank col: `data-lg` for top 3, `data-mono` for rest; right-aligned
- Score: `data-mono`, `text-secondary`
- Row 1 bg: `bg-amber-500/5` + `border-l-2 border-amber-400`
- Row 2 bg: `bg-slate-400/5` + `border-l-2 border-slate-400`
- Row 3 bg: `bg-orange-600/5` + `border-l-2 border-orange-600`
- Rows 4+: alternating `bg-surface-container/50` / transparent
- "My team" row: sticky highlight

---

## API Integration

```ts
// GET /api/v1/contests/:contestId/leaderboard
interface LeaderboardEntry {
  rank: number
  team_id: string
  team_name: string
  total_score: number
  task_scores: { task_id: string; best_score: number; submission_count: number }[]
  last_submission_at: string
}
```

---

## Files to Create

```
src/pages/
└── leaderboard-page.tsx

src/components/leaderboard/
├── leaderboard-table-with-rank-highlight.tsx   # full table with top-3 tints
├── leaderboard-rank-badge.tsx                  # rank number with gold/silver/bronze styling
├── leaderboard-search-and-export-bar.tsx       # search + CSV export
└── leaderboard-frozen-banner.tsx               # shown when phase is frozen
```

---

## Implementation Steps

1. Create `leaderboard-page.tsx`, fetch leaderboard with `useQuery` + `refetchInterval: 30000`
2. Tab bar: "Overall" + dynamic task tabs from contest tasks list
3. `LeaderboardTable`:
   - `rank` column: trophy icon for rank 1, `data-lg` top 3, `data-mono` rest
   - Highlight current user's team row with `ring-1 ring-primary`
   - Sticky header on scroll
4. Sort: clicking column header sorts by that column (client-side)
5. Search: filter teams by name (client-side, `useMemo`)
6. CSV export: generate CSV from current filtered/sorted data, `Blob` download
7. "Frozen" state: show `LeaderboardFrozenBanner` with amber warning styling
8. Auto-refresh badge: "Updated X ago" using `formatDistanceToNow`

---

## Rank Styling Logic

```ts
const rankStyle = (rank: number) => {
  if (rank === 1) return 'bg-amber-500/5 border-l-2 border-amber-400'
  if (rank === 2) return 'bg-slate-400/5 border-l-2 border-slate-400'
  if (rank === 3) return 'bg-orange-600/5 border-l-2 border-orange-600'
  return rank % 2 === 0 ? 'bg-surface-container/50' : ''
}
```

---

## Success Criteria

- [ ] Leaderboard fetches and renders from API
- [ ] Top 3 rows have correct gold/silver/bronze styling
- [ ] Rank numbers use `data-lg` for top 3, `data-mono` for rest
- [ ] Search filters teams client-side
- [ ] CSV export downloads correct data
- [ ] Tab switching shows per-task scores
- [ ] Auto-refresh every 30s with "Updated X ago" indicator
