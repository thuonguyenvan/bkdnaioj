// Tasks API — list tasks by contest, get single task by ID
import type { Task } from '@/types/api-types'
import { api } from '@/lib/axios-api-client-with-jwt-interceptors'

export const tasksApi = {
  listByContest: (contestId: string) =>
    api.get<Task[]>(`/contests/${contestId}/tasks`).then((r) => r.data),

  get: (contestId: string, taskId: string) =>
    api.get<Task>(`/contests/${contestId}/tasks/${taskId}`).then((r) => r.data),
}
