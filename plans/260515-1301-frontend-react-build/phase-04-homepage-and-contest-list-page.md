# Phase 04 — Homepage & Contest List Page

**Priority:** High
**Status:** Pending
**Ref:** `stitch/homepage.html`
**API:** `GET /api/v1/contests`

---

## Overview

Implement the public homepage matching `stitch/homepage.html`:
- Hero section with platform title + CTA buttons
- 4 stat cards (active contests, participants, tasks, submissions)
- Active contest list (cards with status badge + join button)
- Platform feature highlights section

---

## UI Breakdown (from stitch/homepage.html)

### Hero Section
```
[Olympic AI Platform]   — display-lg font, text-on-surface
[Tagline text]          — body-base, text-on-surface-variant
[Join Contest btn]  [Learn More btn]  — primary + ghost
hero-bg class: subtle gradient/grid overlay
```

### Stats Row (4 cards)
```
[🏆 12 Active Contests] [👥 3,842 Participants] [📋 48 Tasks] [📤 142,891 Submissions]
```
→ `StatCard` component, `grid-cols-4` on desktop

### Contest List Section
```
[OLPAI 2026 — Round 1]  [LIVE badge]  [Join Now btn]
  Practice Phase  •  3 Tasks  •  847 teams
```
→ `ContestCard` component, map from API response

---

## API Integration

```ts
// GET /api/v1/contests
interface Contest {
  id: string
  title: string
  short_description: string
  status: 'draft' | 'published' | 'archived'
  start_time: string
  end_time: string
  max_team_size: number
}
```

Stats are derived client-side or from a future `/api/v1/stats` endpoint (use mock for now).

---

## Files to Create / Modify

```
src/pages/
└── home-page.tsx                        # main page component

src/components/
└── contest/
    ├── contest-card.tsx                 # (from Phase 02)
    ├── contest-list-section.tsx         # maps contests → ContestCard
    └── platform-stats-section.tsx       # 4 StatCards with icons
```

---

## Implementation Steps

1. Create `home-page.tsx` with 3 sections: Hero → Stats → ContestList
2. Use `useQuery({ queryKey: ['contests'], queryFn: () => axios.get('/api/v1/contests') })`
3. Map response to `<ContestCard>` with:
   - Status → `<StatusBadge>` (published = LIVE, draft = UPCOMING)
   - `end_time` → countdown timer using `useEffect` + `setInterval`
4. Hero CTA "Join Contest" → scrolls to contest list section
5. Stats: derive from contest list or hardcode with `TODO` comment for real endpoint
6. Handle loading skeleton (3 skeleton cards)
7. Handle empty state: "No active contests" message

---

## Contest Status → Badge Mapping

```ts
const contestStatusBadge = {
  published: { label: 'LIVE',     bg: 'bg-green-500/10', dot: 'bg-green-400 animate-pulse' },
  draft:     { label: 'UPCOMING', bg: 'bg-outline/10',   dot: 'bg-outline' },
  archived:  { label: 'ENDED',    bg: 'bg-error/10',     dot: 'bg-error' },
}
```

---

## Success Criteria

- [ ] Homepage renders hero + stats + contest list
- [ ] Contest list fetches from `/api/v1/contests`
- [ ] LIVE badge pulses with animate-pulse
- [ ] Loading skeleton shows during API fetch
- [ ] "Join Contest" button navigates to `/contests/:id`
- [ ] Responsive: single column on mobile, 2-col on tablet, 4-col stats on desktop
