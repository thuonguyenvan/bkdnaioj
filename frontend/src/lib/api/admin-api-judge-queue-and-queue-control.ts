// Admin API — judge queue list, approve/reject submission, queue stats
import { api } from '@/lib/axios-api-client-with-jwt-interceptors'

export interface JudgeQueueItem {
  submission_id: string
  task_id: string
  team_name: string
  file_name: string
  submitted_at: string
  status: string
}

export interface QueueStats {
  pending: number
  running: number
  completed_today: number
}

export const adminApi = {
  getJudgeQueue: (contestId: string) =>
    api.get<JudgeQueueItem[]>(`/admin/contests/${contestId}/judge-queue`).then((r) => r.data),

  getQueueStats: (contestId: string) =>
    api.get<QueueStats>(`/admin/contests/${contestId}/judge-queue/stats`).then((r) => r.data),

  approveSubmission: (submissionId: string) =>
    api.post(`/admin/submissions/${submissionId}/approve`).then((r) => r.data),

  rejectSubmission: (submissionId: string, reason: string) =>
    api.post(`/admin/submissions/${submissionId}/reject`, { reason }).then((r) => r.data),
}
