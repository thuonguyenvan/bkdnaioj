// Shared API response types for OLPAI backend (Go/Echo /api/v1)
export interface User {
  id: string
  full_name: string
  email: string
  role: 'admin' | 'jury' | 'contestant'
}

export interface Contest {
  id: string
  title: string
  short_description: string
  status: 'draft' | 'registration_open' | 'running' | 'ended' | 'archived' | 'published'
  start_time: string
  end_time: string
  max_team_size: number
}

export interface Task {
  id: string
  contest_id: string
  title: string
  description: string
  metric_name: string
  metric_description: string
  submission_limit_per_day: number
}

export type SubmissionStatus =
  | 'accepted'
  | 'wrong_answer'
  | 'pending'
  | 'running'
  | 'error'
  | 'time_limit'

export interface Submission {
  id: string
  task_id: string
  entry_id: string
  status: SubmissionStatus
  score: number | null
  file_name: string
  notes: string
  created_at: string
}

export interface LeaderboardEntry {
  rank: number
  team_id: string
  team_name: string
  total_score: number
  task_scores: { task_id: string; best_score: number; submission_count: number }[]
  last_submission_at: string
}

export interface Clarification {
  id: string
  subject: string
  status: 'open' | 'closed'
  task_id: string | null
  created_at: string
  messages: ClarificationMessage[]
  unread_count: number
}

export interface ClarificationMessage {
  id: string
  body: string
  is_jury: boolean
  author_name: string
  created_at: string
}

export interface Announcement {
  id: string
  title: string
  body: string
  created_at: string
}
