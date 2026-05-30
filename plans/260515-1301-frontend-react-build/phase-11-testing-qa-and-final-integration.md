# Phase 11 — Testing, QA & Final Integration

**Priority:** Medium
**Status:** Pending

---

## Overview

Write unit + integration tests for critical components and API hooks. QA pass against all 6 Stitch screens. Verify responsive layout on desktop/tablet/mobile. Fix visual regressions.

---

## Test Coverage Targets

| Module | Type | Priority |
|---|---|---|
| `auth-context` | Unit | Critical |
| `axios-client` interceptors | Unit | Critical |
| `use-auth` hook | Unit | High |
| `status-badge` | Unit | High |
| `leaderboard-row-with-rank-highlight` | Unit | High |
| `file-dropzone-with-drag-drop` | Integration | High |
| `submission-page` upload flow | Integration | High |
| `require-auth-guard` | Integration | High |
| `leaderboard-page` | Integration | Medium |
| `admin-judge-queue-monitor-page` | Integration | Medium |

---

## Test Files to Create

```
src/
├── components/ui/__tests__/
│   ├── status-badge.test.tsx
│   ├── progress-bar-with-glow-animation.test.tsx
│   └── tab-bar.test.tsx
├── components/leaderboard/__tests__/
│   └── leaderboard-row-with-rank-highlight.test.tsx
├── components/submission/__tests__/
│   └── submission-file-dropzone.test.tsx
├── hooks/__tests__/
│   ├── use-auth.test.ts
│   └── use-websocket.test.ts
├── lib/__tests__/
│   └── axios-client-interceptors.test.ts
└── pages/__tests__/
    ├── submission-page.test.tsx
    └── leaderboard-page.test.tsx
```

---

## QA Checklist (per Stitch screen)

### Homepage
- [ ] Stats cards render correctly
- [ ] Contest list loads from API mock
- [ ] LIVE badge pulses

### Contest Detail
- [ ] Header card shows correct phase/progress
- [ ] Tab switching works
- [ ] Task list shows scores

### Submission Page
- [ ] File validation rejects wrong types
- [ ] Upload progress bar shows
- [ ] Recent submissions table refreshes

### Leaderboard
- [ ] Top 3 rows have correct bg tints
- [ ] Search filters correctly
- [ ] CSV export downloads

### Clarifications
- [ ] Thread list shows unread dots
- [ ] Bubbles align correctly (contestant right, jury left)
- [ ] Reply input hidden for contestants

### Admin Judge Queue
- [ ] Page rejects non-admin role
- [ ] Log stream auto-scrolls
- [ ] Progress bars animate

---

## Responsive QA

| Breakpoint | Affected pages |
|---|---|
| Mobile (< 768px) | Homepage stats: 2-col; Leaderboard: card stack; Sidebar: hidden (hamburger) |
| Tablet (768–1024px) | 8-col grid; Sidebar: collapsible |
| Desktop (≥ 1024px) | Full layout as Stitch screens |

---

## Implementation Steps

1. Configure Vitest + jsdom in `vite.config.ts`
2. Install `@testing-library/react`, `@testing-library/user-event`, `msw` for API mocking
3. Set up MSW handlers for all backend endpoints
4. Write unit tests for atoms (StatusBadge, ProgressBar)
5. Write integration test for `FileDropzone` (drag event simulation)
6. Write integration test for auth guard (redirect behavior)
7. QA pass: compare each page visually against Stitch screenshots
8. Responsive QA: use browser DevTools device emulation

---

## MSW Handler Setup

```ts
// src/mocks/handlers.ts
import { http, HttpResponse } from 'msw'

export const handlers = [
  http.get('/api/v1/contests', () => HttpResponse.json({ contests: mockContests })),
  http.post('/api/v1/auth/login', () => HttpResponse.json({ token: 'test-jwt', user: mockUser })),
  // ... all endpoints
]
```

---

## Success Criteria

- [ ] All unit tests pass (`npm run test`)
- [ ] No TypeScript errors (`npm run type-check`)
- [ ] No console errors on any page
- [ ] Visual match ≥ 90% vs Stitch screens
- [ ] Mobile layout works on all pages
- [ ] Auth flow works end-to-end with real backend
