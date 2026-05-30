// useContests hook — TanStack Query wrapper for contest list and single contest
import { useQuery } from '@tanstack/react-query'
import { contestsApi } from '@/lib/api/contests-api-list-and-get'
import type { Contest } from '@/types/api-types'

export function useContests() {
  return useQuery<Contest[]>({
    queryKey: ['contests'],
    queryFn: contestsApi.list,
  })
}

export function useContest(contestId: string) {
  return useQuery<Contest>({
    queryKey: ['contest', contestId],
    queryFn: () => contestsApi.get(contestId),
    enabled: !!contestId,
  })
}
