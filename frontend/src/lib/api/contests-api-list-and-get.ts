// Contests API — list/get lifecycle actions and entry management helpers
import type { Contest } from '@/types/api-types'
import { api } from '@/lib/axios-api-client-with-jwt-interceptors'

export interface CreateContestPayload {
  slug: string
  title: string
  entry_policy: 'individual' | 'team' | 'both'
  start_time: string
  end_time: string
  visibility: 'public' | 'private'
  max_team_size: number
  description?: string
}

export const contestsApi = {
  list: () =>
    api.get<Contest[]>('/contests').then((r) => r.data),

  get: (contestId: string) =>
    api.get<Contest>(`/contests/${contestId}`).then((r) => r.data),

  create: (payload: CreateContestPayload) =>
    api.post<Contest>('/contests', payload).then((r) => r.data),

  update: (contestId: string, payload: Partial<CreateContestPayload>) =>
    api.patch<Contest>(`/contests/${contestId}`, payload).then((r) => r.data),

  publish: (contestId: string) =>
    api.post<Contest>(`/contests/${contestId}/publish`).then((r) => r.data),

  archive: (contestId: string) =>
    api.post<Contest>(`/contests/${contestId}/archive`).then((r) => r.data),

  listEntries: (contestId: string) =>
    api.get(`/contests/${contestId}/entries`).then((r) => r.data),

  join: (contestId: string) =>
    api.post(`/contests/${contestId}/entries`).then((r) => r.data),
}
