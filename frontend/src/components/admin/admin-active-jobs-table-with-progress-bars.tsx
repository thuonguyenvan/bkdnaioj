import { ProgressBar } from '@/components/ui/progress-bar-with-glow-animation'
import type { JudgeQueueItem } from '@/lib/api/admin-api-judge-queue-and-queue-control'

interface AdminActiveJobsTableWithProgressBarsProps {
  jobs: JudgeQueueItem[]
}

export function AdminActiveJobsTableWithProgressBars({
  jobs,
}: AdminActiveJobsTableWithProgressBarsProps) {
  return (
    <div className="bg-surface-container border border-outline-variant rounded-lg overflow-x-auto shadow-[0_0_12px_rgba(79,70,229,0.08)]">
      <table className="w-full min-w-[760px]">
        <thead>
          <tr className="text-left text-xs text-on-surface-variant border-b border-outline-variant">
            <th className="px-md py-sm">Job</th>
            <th className="px-md py-sm">Team</th>
            <th className="px-md py-sm">Status</th>
            <th className="px-md py-sm">Progress</th>
            <th className="px-md py-sm">Submitted</th>
          </tr>
        </thead>
        <tbody>
          {jobs.map((j) => {
            const progress = j.status === 'running' ? 60 : j.status === 'queued' ? 10 : 100
            return (
              <tr key={j.submission_id} className="border-b border-outline-variant/60">
                <td className="px-md py-sm font-mono text-primary text-sm">#{j.submission_id.slice(0, 8)}</td>
                <td className="px-md py-sm text-sm text-on-surface">{j.team_name}</td>
                <td className="px-md py-sm text-sm text-on-surface-variant uppercase">{j.status}</td>
                <td className="px-md py-sm w-[240px]">
                  <ProgressBar value={progress} isRunning={j.status === 'running'} />
                </td>
                <td className="px-md py-sm text-sm text-on-surface-variant">{new Date(j.submitted_at).toLocaleTimeString()}</td>
              </tr>
            )
          })}
          {jobs.length === 0 && (
            <tr>
              <td colSpan={5} className="px-md py-lg text-sm text-on-surface-variant text-center">No active jobs.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
