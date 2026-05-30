import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/lib/api/admin-api-judge-queue-and-queue-control'

export function AdminContestSubmissionsPage() {
  const { contestId = '' } = useParams<{ contestId: string }>()
  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ['admin-submissions', contestId],
    queryFn: () => adminApi.getJudgeQueue(contestId),
    enabled: !!contestId,
    refetchInterval: 5000,
  })

  return (
    <div className="p-lg">
      <h1 className="text-2xl font-bold text-on-surface mb-md">Submissions</h1>
      <div className="bg-surface-container border border-outline-variant rounded-lg overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-on-surface-variant border-b border-outline-variant">
              <th className="px-md py-sm">Submission</th>
              <th className="px-md py-sm">Team</th>
              <th className="px-md py-sm">File</th>
              <th className="px-md py-sm">Status</th>
              <th className="px-md py-sm">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.submission_id} className="border-b border-outline-variant/50">
                <td className="px-md py-sm font-mono text-primary">#{j.submission_id.slice(0, 8)}</td>
                <td className="px-md py-sm text-on-surface">{j.team_name}</td>
                <td className="px-md py-sm text-on-surface-variant">{j.file_name}</td>
                <td className="px-md py-sm text-on-surface-variant uppercase">{j.status}</td>
                <td className="px-md py-sm text-on-surface-variant">{new Date(j.submitted_at).toLocaleString()}</td>
              </tr>
            ))}
            {!isLoading && jobs.length === 0 && (
              <tr><td colSpan={5} className="px-md py-lg text-center text-on-surface-variant">No submissions found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
