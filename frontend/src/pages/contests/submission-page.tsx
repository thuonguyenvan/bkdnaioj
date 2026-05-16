// Submission page — file upload with presigned S3 flow + recent submissions table
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { FileDropzone } from '@/components/shared/file-dropzone-with-drag-drop'
import { ProgressBar } from '@/components/ui/progress-bar-with-glow-animation'
import { SubmissionEvaluationMetricCard } from '@/components/submission/submission-evaluation-metric-card'
import { SubmissionRecentSubmissionsTable } from '@/components/submission/submission-recent-submissions-table'
import { tasksApi } from '@/lib/api/tasks-api-list-by-contest-and-get'
import { useCreateSubmission, useSubmissions } from '@/hooks/use-submissions-query-and-create-mutation'
import type { Task } from '@/types/api-types'

export function SubmissionPage() {
  const { contestId = '', taskId = '' } = useParams<{ contestId: string; taskId: string }>()
  const [file, setFile] = useState<File | null>(null)
  const [notes, setNotes] = useState('')
  const [progress, setProgress] = useState(0)

  const { data: task, isLoading: loadingTask } = useQuery<Task>({
    queryKey: ['task', contestId, taskId],
    queryFn: () => tasksApi.get(contestId, taskId),
    enabled: !!contestId && !!taskId,
  })

  const { data: submissions = [], isLoading: loadingSubs } = useSubmissions(taskId, 5000)
  const createSubmission = useCreateSubmission()

  const todayCount = useMemo(() => {
    const now = new Date()
    return submissions.filter((s) => {
      const d = new Date(s.created_at)
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
    }).length
  }, [submissions])

  async function handleSubmit() {
    if (!taskId || !file) return
    setProgress(0)
    await createSubmission.mutateAsync({
      taskId,
      file,
      notes,
      onProgress: setProgress,
    })
    setFile(null)
    setNotes('')
  }

  if (loadingTask || !task) {
    return <div className="p-lg text-sm text-on-surface-variant">Loading submission page…</div>
  }

  return (
    <div className="p-lg bg-gradient-to-b from-primary-container/5 to-transparent rounded-xl">
      <div className="mb-lg">
        <h1 className="text-2xl font-bold text-on-surface">Submit — {task.title}</h1>
        <p className="text-sm text-on-surface-variant mt-xs">Contest #{contestId}</p>
        <p className="text-xs text-secondary mt-xs uppercase tracking-wider">
          {todayCount} / {task.submission_limit_per_day} submissions today
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 gap-md">
        <div className="xl:col-span-3 space-y-lg">
          <SubmissionEvaluationMetricCard task={task} />

          <section className="bg-surface-container border border-outline-variant rounded-lg p-lg space-y-md shadow-[0_0_12px_rgba(79,70,229,0.08)]">
            <h3 className="text-lg font-semibold text-on-surface">Upload File</h3>
            <FileDropzone onFileSelect={setFile} />

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 500))}
              placeholder="Notes (optional, max 500 chars)"
              className="w-full min-h-[110px] bg-surface-container-lowest border border-outline-variant rounded px-md py-sm text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary transition-colors"
            />

            {(createSubmission.isPending || progress > 0) && (
              <div>
                <p className="text-xs text-on-surface-variant mb-xs uppercase tracking-wider">Upload progress: {progress}%</p>
                <ProgressBar value={progress} isRunning={createSubmission.isPending} />
              </div>
            )}

            <Button
              variant="primary"
              size="md"
              className="w-full"
              disabled={!file || createSubmission.isPending || todayCount >= task.submission_limit_per_day}
              onClick={handleSubmit}
            >
              {createSubmission.isPending ? 'Submitting…' : 'Submit'}
            </Button>

            {todayCount >= task.submission_limit_per_day && (
              <p className="text-xs text-error">Daily submission limit reached.</p>
            )}
          </section>
        </div>

        <div className="xl:col-span-2">
          {loadingSubs ? (
            <div className="text-sm text-on-surface-variant">Loading submissions…</div>
          ) : (
            <SubmissionRecentSubmissionsTable submissions={submissions} />
          )}
        </div>
      </div>
    </div>
  )
}
