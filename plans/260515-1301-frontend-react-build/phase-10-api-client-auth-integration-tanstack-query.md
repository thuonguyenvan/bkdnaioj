# Phase 10 — API Client, Auth Integration & TanStack Query Setup

**Priority:** Critical (supports all pages)
**Status:** Pending
**Backend:** Go/Echo `localhost:8080/api/v1` with JWT HS256

---

## Overview

Centralize all API communication: Axios instance with JWT interceptors, TanStack Query client config, auth flow (login/register/me), and typed API functions for all backend endpoints.

---

## Auth Flow

```
1. POST /api/v1/auth/register  → { token, user }
2. POST /api/v1/auth/login     → { token, user }
3. GET  /api/v1/auth/me        → { id, username, role, ... }

Storage: localStorage.setItem('olpai_token', token)
Axios:   Authorization: Bearer <token>  (interceptor)
```

---

## Files to Create

```
src/
├── lib/
│   ├── axios-client.ts                    # configured Axios instance
│   ├── query-client.ts                    # TanStack Query client config
│   └── api/
│       ├── auth-api.ts                    # register, login, me
│       ├── contests-api.ts                # list, get, create, update
│       ├── tasks-api.ts                   # listByContest, get
│       ├── submissions-api.ts             # create (presigned), list, get
│       ├── leaderboard-api.ts             # get leaderboard
│       ├── clarifications-api.ts          # list, create, reply
│       ├── announcements-api.ts           # list
│       └── admin-api.ts                   # judge queue, queue control
├── hooks/
│   ├── use-auth.ts                        # login/logout/me from AuthContext
│   ├── use-contests.ts                    # useQuery wrappers
│   ├── use-submissions.ts                 # useQuery + useMutation
│   ├── use-leaderboard.ts
│   ├── use-clarifications.ts
│   └── use-websocket.ts                   # WS connection + message handler
└── contexts/
    └── auth-context.tsx                   # AuthProvider + useAuth hook
```

---

## Axios Client Setup

```ts
// lib/axios-client.ts
const api = axios.create({ baseURL: '/api/v1', timeout: 30_000 })

// Request interceptor: attach JWT
api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('olpai_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

// Response interceptor: handle 401 → logout
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('olpai_token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)
```

---

## TanStack Query Config

```ts
// lib/query-client.ts
new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,       // 30s fresh
      retry: 2,
      refetchOnWindowFocus: false,
    }
  }
})
```

---

## S3 Presigned Upload Flow

```ts
// lib/api/submissions-api.ts
async function createSubmission(taskId: string, file: File, notes: string) {
  // 1. Request presigned URL
  const { data } = await api.post('/submissions', { task_id: taskId, file_name: file.name, notes })
  // 2. Upload directly to S3
  await axios.put(data.upload_url, file, {
    headers: { 'Content-Type': file.type },
    onUploadProgress: (e) => { /* emit progress */ }
  })
  return data.submission_id
}
```

---

## WebSocket Hook

```ts
// hooks/use-websocket.ts
function useWebSocket(url: string, onMessage: (data: unknown) => void) {
  useEffect(() => {
    const ws = new WebSocket(url)
    ws.onmessage = (e) => onMessage(JSON.parse(e.data))
    ws.onerror = () => console.error('WS error')
    return () => ws.close()
  }, [url])
}
```

---

## Implementation Steps

1. Create `axios-client.ts` with interceptors
2. Create `query-client.ts`, wrap `main.tsx` with `<QueryClientProvider>`
3. Create `auth-context.tsx` with `AuthProvider`
4. Create all `*-api.ts` files with typed request/response shapes
5. Create `use-auth.ts` → `login()` calls API + stores token + sets user state
6. Create `use-websocket.ts` with reconnect logic (exponential backoff)
7. Type all API responses with shared `types/api.ts`

---

## Shared Types File

```
src/types/
└── api-types.ts    # Contest, Task, Submission, LeaderboardEntry, Clarification, User, etc.
```

---

## Success Criteria

- [ ] Login stores JWT and redirects to homepage
- [ ] Logout clears token and redirects to `/login`
- [ ] 401 responses auto-redirect to `/login`
- [ ] All API functions are typed (no `any`)
- [ ] S3 presigned upload works end-to-end
- [ ] TanStack Query caching works (no duplicate fetches)
- [ ] WebSocket reconnects automatically on disconnect
