import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { contestsApi } from '@/lib/api/contests-api-list-and-get'

interface EntryItem {
  id: string
  display_name: string
  entry_type: string
  status: string
  created_at: string
}

export function AdminContestParticipantsPage() {
  const { contestId = '' } = useParams<{ contestId: string }>()
  const { data: entries = [] } = useQuery<EntryItem[]>({
    queryKey: ['admin-participants', contestId],
    queryFn: () => contestsApi.listEntries(contestId),
    enabled: !!contestId,
  })

  return (
    <div className="p-lg">
      <h1 className="text-2xl font-bold text-on-surface mb-md">Participants</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-sm">
        {entries.map((e) => (
          <div key={e.id} className="bg-surface-container border border-outline-variant rounded-lg p-md">
            <p className="text-on-surface font-semibold">{e.display_name}</p>
            <p className="text-xs text-on-surface-variant mt-xs uppercase">{e.entry_type} • {e.status}</p>
            <p className="text-xs text-on-surface-variant mt-xs">Joined {new Date(e.created_at).toLocaleString()}</p>
          </div>
        ))}
        {entries.length === 0 && (
          <p className="text-sm text-on-surface-variant">No participants yet.</p>
        )}
      </div>
    </div>
  )
}
