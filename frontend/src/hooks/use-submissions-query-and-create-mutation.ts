// useSubmissions hook — TanStack Query + useMutation for S3 presigned upload flow
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { submissionsApi } from '@/lib/api/submissions-api-create-with-s3-presigned-upload'
import type { Submission } from '@/types/api-types'

export function useSubmissions(taskId: string, refetchInterval?: number) {
  return useQuery<Submission[]>({
    queryKey: ['submissions', taskId],
    queryFn: () => submissionsApi.listByTask(taskId),
    enabled: !!taskId,
    refetchInterval,
  })
}

interface CreateSubmissionVars {
  taskId: string
  file: File
  notes: string
  onProgress?: (percent: number) => void
}

export function useCreateSubmission() {
  const queryClient = useQueryClient()
  return useMutation<string, Error, CreateSubmissionVars>({
    mutationFn: ({ taskId, file, notes, onProgress }) =>
      submissionsApi.create(taskId, file, notes, { onProgress }),
    onSuccess: (_id, { taskId }) => {
      queryClient.invalidateQueries({ queryKey: ['submissions', taskId] })
    },
  })
}
