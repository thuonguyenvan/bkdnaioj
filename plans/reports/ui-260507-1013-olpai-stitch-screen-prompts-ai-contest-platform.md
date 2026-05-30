# OLPAI — Stitch UI Build Prompts
**Date:** 2026-05-07 | **Project:** OLPAI AI Contest Platform

---

## Design System Prompt

```
Create a dark-mode-first design system for OLPAI — an AI Contest Platform (Online Judge for AI competitions).

IDENTITY:
- Name: OLPAI (Olympic AI Platform)
- Purpose: AI contest management, automated judging, leaderboard, submission portal
- Target users: university students, competition organizers (jury), admins

COLOR PALETTE:
- Primary: Deep Indigo #4F46E5 (electric blue-purple, like competitive programming energy)
- Secondary: Cyan #06B6D4 (accent for scores, rankings, live status)
- Success: Emerald #10B981
- Danger: Rose #F43F5E
- Warning: Amber #F59E0B
- Background dark: #0F0F1A (near-black with slight blue tint)
- Surface: #1A1A2E (card/panel background)
- Surface 2: #16213E (elevated surface)
- Border: #2A2A4A (subtle border)
- Text primary: #F1F5F9
- Text secondary: #94A3B8
- Text muted: #475569

TYPOGRAPHY:
- Font family: "JetBrains Mono" for code/numbers, "Inter" for UI text
- Use monospace for scores, ranks, submission IDs, timestamps

SHAPE:
- Border radius: medium-rounded (8px cards, 4px inputs, 12px modals)
- Slightly sharp for a technical/competitive feel (not too bubbly)

DESIGN TOKENS:
- Spacing scale: 4px base
- Shadow: subtle glow effects on primary elements
- Status badges with color-coded dot indicators
- Leaderboard rows with rank number in bold monospace

INSPIRATION: Codeforces + Kaggle + LeetCode — but darker, more modern, with better visual hierarchy
```

---

## Screen 1: Homepage / Contest List

```
Design a dark-mode homepage for OLPAI, an AI Contest Platform for Vietnamese university students.

LAYOUT (Desktop, 1440px):
- Top navigation bar: Logo "OLPAI" left, nav links (Contests, Practice, Leaderboard, Docs), right side: Login / Register buttons
- Hero section: Bold headline "Olympic AI Platform" with sub-text "Organize, compete, and practice AI challenges — automated judging, real-time leaderboards", background with subtle animated gradient mesh in deep indigo/cyan
- Live contest banner: Highlighted card showing current active contest "OLPAI 2026 — Round 1" with countdown timer, "Join Now" CTA button
- Contests grid: 3-column grid of contest cards, each showing:
  - Contest name (bold)
  - Status badge (ACTIVE in green, UPCOMING in amber, ENDED in gray)
  - Date range
  - Number of tasks
  - Number of teams registered
  - "View Details" button
- Stats row: 4 stats "1,200+ Submissions", "150+ Teams", "12 Contests", "5 Task Types"
- Footer: minimal, dark

STYLE: Dark (#0F0F1A bg), electric indigo/cyan accents, cards on #1A1A2E surface, monospace numbers for stats, subtle glow on active elements, very clean and technical
```

---

## Screen 2: Contest Detail Page

```
Design a dark-mode contest detail page for OLPAI AI Contest Platform.

PAGE HEADER:
- Contest title: "OLPAI 2026 — Round 1 — AI Classification Challenge"
- Status: ACTIVE badge (green pulse dot)
- Countdown timer: "02d 14h 37m 22s" in large monospace font
- Team info: "Team Alpha · 3 members"
- Register/Join button

TABS NAVIGATION:
- Overview | Tasks | My Submissions | Leaderboard | Announcements | Clarifications

ACTIVE TAB: Tasks list showing:
- Task card grid (2 columns):
  - Task name: "Task 1 — Image Classification"
  - Phase: "Phase 1 — Public Test" badge (cyan)
  - Submission limit: "5 / 10 remaining"
  - Best score: "0.8742 F1-Score" in green monospace
  - Status: Submitted ✓
  - "Submit" button (indigo)
  - Task 2: "NLP Text Classification" — Not submitted yet
  - Task 3: "Object Detection" — Phase not open (locked icon)

RIGHT SIDEBAR:
- Contest rules summary card
- Important dates timeline
- Download data files section with file list

STYLE: Same dark theme, task cards on elevated surface, score numbers in JetBrains Mono, status color coding
```

---

## Screen 3: Leaderboard

```
Design a dark-mode leaderboard page for OLPAI AI Contest Platform.

HEADER:
- "Leaderboard — OLPAI 2026 Round 1"
- Toggle tabs: "Overall" | "Task 1" | "Task 2" | "Task 3"
- Status: "Public Leaderboard" badge, Last updated timestamp

FILTER BAR:
- Phase selector dropdown (Phase 1 - Public Test)
- Entry mode toggle: Individual / Team
- Freeze indicator (if frozen, show banner)

LEADERBOARD TABLE (full width):
- Rank column: #1 #2 #3 with gold/silver/bronze highlight for top 3
- Team name column
- University/org tag (small badge)
- Score per task (Task 1, Task 2, Task 3) — monospace numbers
- Total score — bold, larger font
- Best submission time
- Submissions count
- Last submitted timestamp

Row styling:
- Current user's team row highlighted in indigo tint
- Top 3 rows have subtle gold/silver/bronze left border accent
- Alternating row backgrounds (#1A1A2E / #16213E)
- Hover state highlights the row

BELOW TABLE:
- Pagination controls

STYLE: Dense data table feel like Codeforces/Kaggle leaderboard but dark and modern, monospace numbers throughout, clean column alignment
```

---

## Screen 4: Submission Page

```
Design a dark-mode submission page for OLPAI AI Contest Platform.

PAGE TITLE: "Submit — Task 1: Image Classification · Phase 1 Public Test"

LEFT COLUMN (main):
- Task info card: description summary, evaluation metric "F1-Score (macro)", submission format requirements
- Upload zone: Large drag-and-drop area with dashed border, "Drop your prediction CSV file here or click to browse", file type indicators (.csv, max 50MB)
- Submission notes field (optional textarea)
- "Submit Now" CTA button (large, indigo gradient)
- Submission counter: "5 of 10 submissions used today"

RIGHT COLUMN (sidebar):
- Submission history table:
  - Columns: #, Submitted at, File, Status, Score
  - Status badges: Finished (green), Running (amber pulse), Validation Failed (red), Queued (gray)
  - Scores in monospace, best score highlighted
  - Click row to view details
- "Download Sample Submission" link

STATUS PIPELINE (animated when pending):
- Steps: Uploaded → Validating → Queued → Running → Scoring → Finished
- Current step highlighted with pulse animation

STYLE: Clean two-column layout, status badges with color coding, drag-drop zone with hover state, submission history as compact data table
```

---

## Screen 5: Admin / Jury Dashboard

```
Design a dark-mode admin dashboard for OLPAI contest organizer (jury).

SIDEBAR NAVIGATION:
- Logo top
- Nav items: Overview, Contests, Tasks, Submissions Queue, Leaderboard, Announcements, Clarifications, Rejudge, System Log
- Active: "Submissions Queue"

MAIN CONTENT — Submission Queue:
- Page title: "Judge Queue Monitor"
- Stats row: 4 cards — "In Queue: 23", "Running: 4", "Completed today: 187", "Failed: 2"
- Queue table:
  - Columns: Job ID, Team, Task, Phase, Submitted At, Status, Worker, Duration, Actions
  - Status badges: Queued/Running (amber pulse) / Finished (green) / Failed (red)
  - Actions: View Log, Rejudge button
- Filter bar: By task, by phase, by status, date range picker

RIGHT PANEL (drawer or aside):
- Job detail view when row selected
- Shows: submission file info, validation log, scoring log, raw output, error if any

BOTTOM: Rejudge control — "Select submissions → Rejudge Selected" button

STYLE: Dense admin UI, data-heavy, monospace for IDs/timestamps, status color coding, sidebar dark at #111122, content slightly lighter
```

---

## Screen 6: Clarification Thread

```
Design a dark-mode clarification/Q&A page for OLPAI contest platform.

LAYOUT: Two-column
LEFT: List of clarification threads
- Each item shows: Team name, task tag, time, first line of question, status badge (Pending / Answered / Public)
- Unread indicator dot
- Filter: All / Pending / Answered / Public

RIGHT: Active thread
- Thread header: "Q from Team Beta · Task 2 · 3 hours ago"
- Question message bubble (left-aligned, team color)
- Jury reply bubble (right-aligned, indigo bg) with timestamp
- "Make Public" toggle button for jury
- Reply compose box at bottom: textarea + "Send Reply" button + "Make Public" checkbox

TOP ACTION BAR:
- "New Announcement" button
- Contest selector

STYLE: Chat-like thread interface, dark, message bubbles with clear sender distinction, status badges, compact list on left
```

---

## Stitch Generation Order

1. **Design System** → create_design_system (dark indigo theme)
2. **Homepage** → generate_screen_from_text
3. **Contest Detail** → generate_screen_from_text
4. **Leaderboard** → generate_screen_from_text
5. **Submission Page** → generate_screen_from_text
6. **Admin Queue** → generate_screen_from_text
7. **Clarification** → generate_screen_from_text
