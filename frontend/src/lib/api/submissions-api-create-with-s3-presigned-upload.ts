// Submissions API — create submission with S3 presigned upload, list, get by ID
import axios from 'axios'
import type { Submission } from '@/types/api-types'
import { api } from '@/lib/axios-api-client-with-jwt-interceptors'

export interface CreateSubmissionResponse {
  submission_id: string
  upload_url: string
}

export interface SubmissionProgressCallback {
  onProgress?: (percent: number) => void
}

export const submissionsApi = {
  // Step 1: get presigned URL; Step 2: PUT file to S3
  create: async (
    taskId: string,
    file: File,
    notes: string,
    { onProgress }: SubmissionProgressCallback = {},
  ): Promise<string> => {
    const { data } = await api.post<CreateSubmissionResponse>('/submissions', {
      task_id: taskId,
      file_name: file.name,
      notes,
    })
    await axios.put(data.upload_url, file, {
      headers: { 'Content-Type': file.type || 'application/octet-stream' },
      onUploadProgress: (e) => {
        if (onProgress && e.total) {
          onProgress(Math.round((e.loaded / e.total) * 100))
        }
      },
    })
    return data.submission_id
  },

  listByTask: (taskId: string) =>
    api.get<Submission[]>(`/submissions?task_id=${taskId}`).then((r) => r.data),

  get: (submissionId: string) =>
    api.get<Submission>(`/submissions/${submissionId}`).then((r) => r.data),
}
