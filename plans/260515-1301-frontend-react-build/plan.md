# Frontend React Build — OLPAI AI Contest Platform

> Based on 7 Stitch screens (stitch/) + backend API (Go/Echo, `/api/v1`)

**Status:** Planning
**Branch:** `feature/frontend-react`
**Design source:** `stitch/` — Dark mode, Inter + JetBrains Mono, Indigo/Cyan palette

---

## Screens → Routes Mapping

| Screen file | Route | Role |
|---|---|---|
| `homepage.html` | `/` | Public |
| `contest-detail.html` | `/contests/:id` | Public/Auth |
| `submission-page.html` | `/contests/:id/tasks/:taskId/submit` | Auth |
| `leaderboard.html` | `/contests/:id/leaderboard` | Public |
| `clarifications.html` | `/contests/:id/clarifications` | Auth |
| `admin-dashboard.html` | `/admin/contests/:id/judge-queue` | Admin |
| `navigation.html` | Layout component | — |

---

## Phases

| Phase | File | Status |
|---|---|---|
| 01 | [Project Setup](phase-01-project-setup.md) | Pending |
| 02 | [Design System & Shared Components](phase-02-design-system-shared-components.md) | Pending |
| 03 | [Layout & Navigation](phase-03-layout-navigation.md) | Pending |
| 04 | [Homepage & Contest List](phase-04-homepage-contest-list.md) | Pending |
| 05 | [Contest Detail Page](phase-05-contest-detail-page.md) | Pending |
| 06 | [Submission Page](phase-06-submission-page.md) | Pending |
| 07 | [Leaderboard Page](phase-07-leaderboard-page.md) | Pending |
| 08 | [Clarifications Page](phase-08-clarifications-page.md) | Pending |
| 09 | [Admin Judge Queue](phase-09-admin-judge-queue.md) | Pending |
| 10 | [API Integration & Auth](phase-10-api-integration-auth.md) | Pending |
| 11 | [Testing & QA](phase-11-testing-qa.md) | Pending |

---

## Key Dependencies

- Backend API: `http://localhost:8080/api/v1`
- Auth: JWT (localStorage), roles: `admin | jury | contestant`
- WebSocket: `/ws` (judge queue live updates)
