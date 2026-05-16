import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { adminApi } from '@/lib/api/admin-api-judge-queue-and-queue-control'
import { useWebSocketWithAutoReconnect } from '@/hooks/use-websocket-with-auto-reconnect'
import { AdminJudgeQueueStatsRowFourMetricsCards } from '@/components/admin/admin-judge-queue-stats-row-four-metrics-cards'
import { AdminActiveJobsTableWithProgressBars } from '@/components/admin/admin-active-jobs-table-with-progress-bars'
import { AdminLogStreamViewerWithFollowTailToggle } from '@/components/admin/admin-log-stream-viewer-with-follow-tail-toggle'

export function AdminJudgeQueueMonitorPage() {
  const { contestId = '' } = useParams<{ contestId: string }>()
  const [followTail, setFollowTail] = useState(true)
  const [logLines, setLogLines] = useState<string[]>([])

  const { data: jobs = [] } = useQuery({
    queryKey: ['admin-judge-queue', contestId],
    queryFn: () => adminApi.getJudgeQueue(contestId),
    enabled: !!contestId,
    refetchInterval: 3000,
  })

  const { data: stats } = useQuery({
    queryKey: ['admin-queue-stats', contestId],
    queryFn: () => adminApi.getQueueStats(contestId),
    enabled: !!contestId,
    refetchInterval: 10000,
  })

  const wsUrl = useMemo(() => {
    if (!contestId) return null
    return `ws://localhost:8080/ws?contest_id=${contestId}`
  }, [contestId])

  useWebSocketWithAutoReconnect(wsUrl, (data) => {
    const line = typeof data === 'string' ? data : JSON.stringify(data)
    setLogLines((prev) => [...prev.slice(-199), line])
  })

  return (
    <div className="p-lg space-y-md bg-gradient-to-b from-primary-container/5 to-transparent rounded-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-on-surface">Judge Queue Monitor</h1>
        <div className="text-xs text-green-400 uppercase tracking-wider">● Workers Active</div>
      </div>

      <AdminJudgeQueueStatsRowFourMetricsCards
        pending={stats?.pending ?? 0}
        running={stats?.running ?? 0}
        completedToday={stats?.completed_today ?? 0}
        errors={0}
      />

      <AdminActiveJobsTableWithProgressBars jobs={jobs} />

      <AdminLogStreamViewerWithFollowTailToggle
        lines={logLines}
        followTail={followTail}
        onToggleFollowTail={() => setFollowTail((v) => !v)}
      />
    </div>
  )
}
