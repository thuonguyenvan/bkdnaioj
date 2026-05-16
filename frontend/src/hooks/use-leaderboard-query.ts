// useLeaderboard hook — TanStack Query wrapper for contest leaderboard
import { useQuery } from '@tanstack/react-query'
import { leaderboardApi } from '@/lib/api/leaderboard-api-get-by-contest'
import type { LeaderboardEntry } from '@/types/api-types'

export function useLeaderboard(contestId: string) {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard', contestId],
    queryFn: () => leaderboardApi.getByContest(contestId),
    enabled: !!contestId,
  })
}
