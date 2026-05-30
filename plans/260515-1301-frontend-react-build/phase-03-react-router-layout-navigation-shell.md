# Phase 03 — React Router Layout & Navigation Shell

**Priority:** High
**Status:** Pending
**Ref:** `stitch/navigation.html` (0 bytes — embedded in all screens), `stitch/homepage.html`, `stitch/contest-detail.html`

---

## Overview

Set up React Router v6 route tree with two layout shells observed in Stitch screens:
1. **TopNav layout** — fixed top navbar (homepage, leaderboard, submission-page)
2. **SidebarNav layout** — fixed left sidebar 64px wide (contest-detail, clarifications, admin-dashboard)

Auth guard wraps protected routes.

---

## Route Tree

```
/                           → PublicLayout
  index                     → HomePage
  /contests                 → ContestListPage (redirects to /)
  /contests/:contestId      → ContestLayout (SidebarNavLayout)
    index                   → ContestDetailPage
    /tasks/:taskId/submit   → SubmissionPage
    /leaderboard            → LeaderboardPage  (TopNavLayout variant)
    /clarifications         → ClarificationsPage
  /admin                    → AdminLayout (requires role=admin)
    /contests/:contestId/judge-queue → AdminJudgeQueuePage

/login                      → LoginPage (no layout)
/register                   → RegisterPage (no layout)
```

---

## TopNavbar (from stitch/homepage.html)

```
[OLPAI logo]  [Contests] [Leaderboard]  ...  [Sign In] [Join Contest btn]
```
- Fixed top, `h-16`, `max-w-[1440px] mx-auto px-lg`
- Border bottom: `border-outline-variant`
- Auth state: shows avatar + username when logged in

## ContestSidebar (from stitch/contest-detail.html + clarifications.html)

```
[Contest name]  (secondary color)
[Phase indicator]  — 01 / 04  PRACTICE
─────────────────
[Task A]  (active: primary, inactive: on-surface-variant)
[Task B]
[Task C]
─────────────────
[Leaderboard]
[Clarifications]
[Announcements]
─────────────────
[Admin] (role-gated)
```
- Fixed left, `w-64`, `h-screen`, `bg-surface-container-low`, `border-r border-outline-variant`

---

## Files to Create

```
src/
├── router.tsx                           # createBrowserRouter config
├── layouts/
│   ├── top-nav-public-layout.tsx        # homepage, leaderboard
│   ├── contest-sidebar-layout.tsx       # contest-detail, clarifications
│   └── admin-sidebar-layout.tsx         # admin pages
├── components/
│   ├── navigation/
│   │   ├── top-navbar.tsx
│   │   ├── contest-sidebar-nav.tsx
│   │   └── admin-sidebar-nav.tsx
│   └── auth/
│       └── require-auth-guard.tsx       # redirects to /login if no token
└── pages/
    ├── login-page.tsx                   # placeholder
    ├── register-page.tsx                # placeholder
    └── not-found-page.tsx
```

---

## Implementation Steps

1. Create `router.tsx` with `createBrowserRouter`
2. Build `TopNavbar` — logo, nav links, auth state from context
3. Build `ContestSidebarNav` — receives `contestId`, fetches contest + tasks
4. Build `RequireAuthGuard` — reads JWT from localStorage, redirects to `/login`
5. Build `TopNavPublicLayout` — renders `<TopNavbar>` + `<Outlet>`
6. Build `ContestSidebarLayout` — renders sidebar + `<Outlet className="ml-64 mt-16">`
7. Build `AdminSidebarLayout` — wraps `RequireAuthGuard` + admin role check
8. Register all routes in `router.tsx`, wrap `App.tsx` with `RouterProvider`
9. Create `AuthContext` with `useAuth()` hook (token + user + role)

---

## Auth Context Shape

```ts
interface AuthContext {
  token: string | null
  user: { id: string; username: string; role: string } | null
  login: (token: string, user: User) => void
  logout: () => void
  isAdmin: boolean
}
```
Store token in `localStorage`, user in memory (decoded JWT payload).

---

## Success Criteria

- [ ] All routes render correct layout shell
- [ ] `RequireAuthGuard` redirects unauthenticated users
- [ ] Admin routes reject non-admin roles
- [ ] `ContestSidebarNav` active link highlights correct task
- [ ] `TopNavbar` shows login/logout correctly
- [ ] 404 page renders for unknown routes
