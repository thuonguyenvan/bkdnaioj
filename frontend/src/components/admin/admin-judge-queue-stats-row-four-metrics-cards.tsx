interface AdminJudgeQueueStatsRowFourMetricsCardsProps {
  pending: number
  running: number
  completedToday: number
  errors: number
}

export function AdminJudgeQueueStatsRowFourMetricsCards({
  pending,
  running,
  completedToday,
  errors,
}: AdminJudgeQueueStatsRowFourMetricsCardsProps) {
  const items = [
    { label: 'Queued', value: pending, color: 'text-primary' },
    { label: 'Running', value: running, color: 'text-secondary' },
    { label: 'Judged Today', value: completedToday, color: 'text-green-400' },
    { label: 'Errors', value: errors, color: 'text-error' },
  ]

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-sm">
      {items.map((i) => (
        <div key={i.label} className="bg-surface-container border border-outline-variant rounded p-md">
          <p className="text-xs text-on-surface-variant uppercase tracking-wider">{i.label}</p>
          <p className={`text-xl font-bold mt-xs ${i.color}`}>{i.value}</p>
        </div>
      ))}
    </div>
  )
}
