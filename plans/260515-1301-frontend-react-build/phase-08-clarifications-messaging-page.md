# Phase 08 — Clarifications Messaging Page

**Priority:** Medium
**Status:** Pending
**Ref:** `stitch/clarifications.html`
**API:** `GET /api/v1/contests/:id/clarifications`, `POST /api/v1/clarifications`, WebSocket `/ws`

---

## Overview

Implement clarifications page matching `stitch/clarifications.html`. Two-pane layout: left = thread list (within ContestSidebarLayout), main = message bubble chat. Contestants ask questions; jury/admin replies.

---

## UI Breakdown (from stitch/clarifications.html)

### Left: Thread List (inside ContestSidebarLayout)
```
[Clarifications]  label-caps header
─────────────────
[Task A: Format question]  — unread dot, timestamp
[General: Scoring query]   — read, muted
[Task B: Time limit]       — unread dot
[+ New Question btn]       — ghost, bottom
```

### Main: Message Thread
```
Header: [Team_Omega]  [Task A: Format question]  [Open badge]
─────────
[Team_Omega bubble]  (right-aligned, bg-primary-container/20)
  "Is the submission format..."
  May 14, 14:32
[Jury reply bubble]  (left-aligned, bg-surface-container)
  "Yes, please submit as..."
  May 14, 15:01

─────────
[Reply input]  •  only jury/admin can reply  •  [Send btn]
[Contestant sees: "Awaiting jury response..." if no reply yet]
```

---

## API Integration

```ts
// GET /api/v1/contests/:id/clarifications
interface Clarification {
  id: string; subject: string; status: 'open' | 'closed'
  task_id: string | null; created_at: string
  messages: ClarificationMessage[]
  unread_count: number
}

interface ClarificationMessage {
  id: string; body: string; is_jury: boolean
  author_name: string; created_at: string
}

// POST /api/v1/clarifications  → create new thread
// POST /api/v1/clarifications/:id/messages  → reply (jury only)
// PATCH /api/v1/clarifications/:id  → close thread (jury only)
```

---

## Files to Create

```
src/pages/
└── clarifications-page.tsx

src/components/clarification/
├── clarification-thread-list-panel.tsx         # left list of threads
├── clarification-thread-list-item.tsx          # single thread preview with unread dot
├── clarification-message-thread-view.tsx       # main message area
├── clarification-message-bubble.tsx            # individual message bubble
├── clarification-new-thread-modal.tsx          # modal: subject + task selector + body
└── clarification-reply-input-bar.tsx           # bottom input (jury only)
```

---

## Implementation Steps

1. Create `clarifications-page.tsx` with split layout: thread list + active thread
2. Thread list: fetch all clarifications, click selects active thread
3. Unread indicator: red dot if `unread_count > 0`
4. Message bubbles:
   - Contestant: right-aligned, `bg-primary-container/20`, `text-on-surface`
   - Jury: left-aligned, `bg-surface-container`, `text-on-surface-variant`
   - Timestamp: `body-sm`, muted, below bubble
5. New thread modal (contestant):
   - Subject input, Task selector (optional), message body textarea
   - `POST /api/v1/clarifications`
6. Reply bar (jury/admin only): shown based on `user.role`
7. Real-time: WebSocket subscription for new messages (or poll every 10s fallback)
8. Mark as read: `PATCH` on thread open

---

## Success Criteria

- [ ] Thread list renders with unread indicators
- [ ] Selecting thread shows message bubbles with correct alignment
- [ ] Contestant can create new clarification thread
- [ ] Jury/admin can reply (input visible only for jury/admin)
- [ ] "Awaiting response" shown when no jury reply yet
- [ ] Messages refresh in near-real-time (WS or poll)
- [ ] Closed threads shown with `[Closed]` badge
