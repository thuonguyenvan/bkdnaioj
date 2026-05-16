// Announcements API — list contest announcements ordered by created_at desc
import type { Announcement } from '@/types/api-types'
import { api } from '@/lib/axios-api-client-with-jwt-interceptors'

export const announcementsApi = {
  listByContest: (contestId: string) =>
    api.get<Announcement[]>(`/contests/${contestId}/announcements`).then((r) => r.data),
}
