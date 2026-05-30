import { useParams } from 'react-router-dom'
import { useClarifications } from '@/hooks/use-clarifications-query-and-mutations'

export function AdminContestClarificationsPage() {
  const { contestId = '' } = useParams<{ contestId: string }>()
  const { data: threads = [] } = useClarifications(contestId)

  return (
    <div className="p-lg">
      <h1 className="text-2xl font-bold text-on-surface mb-md">Clarifications</h1>
      <div className="space-y-sm">
        {threads.map((t) => (
          <div key={t.id} className="bg-surface-container border border-outline-variant rounded-lg p-md">
            <div className="flex items-center justify-between gap-sm">
              <p className="text-on-surface font-semibold">{t.subject}</p>
              <span className="text-xs uppercase text-on-surface-variant">{t.status}</span>
            </div>
            <p className="text-xs text-on-surface-variant mt-xs">{t.messages.length} messages • {new Date(t.created_at).toLocaleString()}</p>
          </div>
        ))}
        {threads.length === 0 && <p className="text-sm text-on-surface-variant">No clarifications found.</p>}
      </div>
    </div>
  )
}
