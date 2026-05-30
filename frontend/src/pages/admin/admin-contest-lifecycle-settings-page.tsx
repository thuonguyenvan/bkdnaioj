import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { contestsApi } from '@/lib/api/contests-api-list-and-get'

export function AdminContestLifecycleSettingsPage() {
  const { contestId = '' } = useParams<{ contestId: string }>()
  const { data: contest, refetch } = useQuery({
    queryKey: ['admin-contest-settings', contestId],
    queryFn: () => contestsApi.get(contestId),
    enabled: !!contestId,
  })
  const [busy, setBusy] = useState(false)

  const status = useMemo(() => contest?.status ?? 'unknown', [contest?.status])

  async function onPublish() {
    if (!contestId) return
    setBusy(true)
    try { await contestsApi.publish(contestId); await refetch() } finally { setBusy(false) }
  }

  async function onArchive() {
    if (!contestId) return
    setBusy(true)
    try { await contestsApi.archive(contestId); await refetch() } finally { setBusy(false) }
  }

  return (
    <div className="p-lg space-y-md">
      <h1 className="text-2xl font-bold text-on-surface">Contest Lifecycle</h1>
      <div className="bg-surface-container border border-outline-variant rounded-lg p-md space-y-sm">
        <p className="text-sm text-on-surface"><span className="font-semibold">Title:</span> {contest?.title ?? '—'}</p>
        <p className="text-sm text-on-surface"><span className="font-semibold">Status:</span> <span className="uppercase">{status}</span></p>
        <div className="flex gap-sm pt-xs">
          <button type="button" disabled={busy} onClick={onPublish} className="px-md py-sm rounded bg-primary-container text-white text-sm font-semibold disabled:opacity-50">Publish</button>
          <button type="button" disabled={busy} onClick={onArchive} className="px-md py-sm rounded border border-outline-variant text-sm text-on-surface disabled:opacity-50">Archive</button>
        </div>
      </div>
    </div>
  )
}
