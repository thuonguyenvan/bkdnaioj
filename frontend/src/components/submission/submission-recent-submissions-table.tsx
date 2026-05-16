// Submission recent table — recent submissions with status badges
import { SubmissionStatusRow } from '@/components/contest/submission-status-row'
import type { Submission } from '@/types/api-types'

interface SubmissionRecentSubmissionsTableProps {
  submissions: Submission[]
}

export function SubmissionRecentSubmissionsTable({
  submissions,
}: SubmissionRecentSubmissionsTableProps) {
  return (
    <section className="bg-surface-container border border-outline-variant rounded-lg p-md">
      <h3 className="text-lg font-semibold text-on-surface mb-md">Recent Submissions</h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[520px]">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-on-surface-variant border-b border-outline-variant">
              <th className="py-sm px-md font-semibold">ID</th>
              <th className="py-sm px-md font-semibold">Submitted</th>
              <th className="py-sm px-md font-semibold">Score</th>
              <th className="py-sm px-md font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {submissions.map((s) => (
              <SubmissionStatusRow key={s.id} submission={s} />
            ))}
          </tbody>
        </table>
      </div>
      {submissions.length === 0 && (
        <p className="text-sm text-on-surface-variant mt-md">No submissions yet.</p>
      )}
    </section>
  )
}
