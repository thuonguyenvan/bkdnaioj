// Leaderboard API — get contest leaderboard entries sorted by rank
import type { LeaderboardEntry } from '@/types/api-types'
import { api } from '@/lib/axios-api-client-with-jwt-interceptors'

export const leaderboardApi = {
  getByContest: (contestId: string) =>
    api.get<LeaderboardEntry[]>(`/contests/${contestId}/leaderboard`).then((r) => r.data),
}
