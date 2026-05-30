// useClarifications hook — TanStack Query + mutations for list, create, reply
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  clarificationsApi,
  type CreateClarificationPayload,
  type ReplyPayload,
} from '@/lib/api/clarifications-api-list-create-and-reply'
import type { Clarification } from '@/types/api-types'

export function useClarifications(contestId: string) {
  return useQuery<Clarification[]>({
    queryKey: ['clarifications', contestId],
    queryFn: () => clarificationsApi.listByContest(contestId),
    enabled: !!contestId,
  })
}

export function useCreateClarification(contestId: string) {
  const queryClient = useQueryClient()
  return useMutation<Clarification, Error, CreateClarificationPayload>({
    mutationFn: clarificationsApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clarifications', contestId] })
    },
  })
}

export function useReplyClarification(contestId: string) {
  const queryClient = useQueryClient()
  return useMutation<unknown, Error, { clarificationId: string; payload: ReplyPayload }>({
    mutationFn: ({ clarificationId, payload }) =>
      clarificationsApi.reply(clarificationId, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clarifications', contestId] })
    },
  })
}
