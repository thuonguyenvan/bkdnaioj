// Leaderboard search + export controls
import { Button } from '@/components/ui/button'

interface LeaderboardSearchAndExportBarProps {
  search: string
  onSearchChange: (value: string) => void
  onExportCsv: () => void
  updatedLabel: string
}

export function LeaderboardSearchAndExportBar({
  search,
  onSearchChange,
  onExportCsv,
  updatedLabel,
}: LeaderboardSearchAndExportBarProps) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-sm mb-md bg-surface-container border border-outline-variant rounded-lg p-sm">
      <p className="text-xs text-on-surface-variant">Last updated: {updatedLabel}</p>
      <div className="flex gap-sm">
        <input
          type="text"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search teams"
          className="bg-surface-container-lowest border border-outline-variant rounded px-md py-sm text-sm text-on-surface placeholder:text-outline focus:outline-none focus:border-primary"
        />
        <Button variant="outline" size="sm" onClick={onExportCsv}>Export CSV</Button>
      </div>
    </div>
  )
}
