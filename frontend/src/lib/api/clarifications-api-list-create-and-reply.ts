// Clarifications API — list threads, create new thread, post reply message
import type { Clarification } from '@/types/api-types'
import { api } from '@/lib/axios-api-client-with-jwt-interceptors'

export interface CreateClarificationPayload {
  contest_id: string
  task_id?: string
  subject: string
  body: string
}

export interface ReplyPayload {
  body: string
}

export const clarificationsApi = {
  listByContest: (contestId: string) =>
    api.get<Clarification[]>(`/contests/${contestId}/clarifications`).then((r) => r.data),

  create: (payload: CreateClarificationPayload) =>
    api.post<Clarification>('/clarifications', payload).then((r) => r.data),

  reply: (clarificationId: string, payload: ReplyPayload) =>
    api
      .post(`/clarifications/${clarificationId}/messages`, payload)
      .then((r) => r.data),
}
