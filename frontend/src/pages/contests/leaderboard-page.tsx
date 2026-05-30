// Leaderboard page — API-backed ranking table with search/sort/export
import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { leaderboardApi } from '@/lib/api/leaderboard-api-get-by-contest'
import { LeaderboardSearchAndExportBar } from '@/components/leaderboard/leaderboard-search-and-export-bar'
import {
  LeaderboardTableWithRankHighlightAndSort,
  type SortKey,
} from '@/components/leaderboard/leaderboard-table-with-rank-highlight-and-sort'
import type { LeaderboardEntry } from '@/types/api-types'

function toCsv(rows: LeaderboardEntry[]): string {
  const header = ['rank', 'team_name', 'total_score', 'submissions', 'last_submission_at']
  const body = rows.map((r) => {
    const submissions = r.task_scores.reduce((a, t) => a + t.submission_count, 0)
    return [r.rank, r.team_name, r.total_score, submissions, r.last_submission_at]
      .map((v) => `"${String(v).replaceAll('"', '""')}"`)
      .join(',')
  })
  return [header.join(','), ...body].join('\n')
}

export function LeaderboardPage() {
  const { contestId = '' } = useParams<{ contestId: string }>()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('rank')
  const [activeTaskTab, setActiveTaskTab] = useState<number>(-1)

  const { data = [], isLoading, dataUpdatedAt } = useQuery<LeaderboardEntry[]>({
    queryKey: ['leaderboard', contestId],
    queryFn: () => leaderboardApi.getByContest(contestId),
    enabled: !!contestId,
    refetchInterval: 30_000,
  })

  const filtered = useMemo(
    () => data.filter((r) => r.team_name.toLowerCase().includes(search.toLowerCase())),
    [data, search],
  )

  const sorted = useMemo(() => {
    const rows = [...filtered]
    if (activeTaskTab >= 0) {
      rows.sort((a, b) => (b.task_scores[activeTaskTab]?.best_score ?? -1) - (a.task_scores[activeTaskTab]?.best_score ?? -1))
      return rows
    }
    if (sortKey === 'rank') rows.sort((a, b) => a.rank - b.rank)
    if (sortKey === 'score') rows.sort((a, b) => b.total_score - a.total_score)
    if (sortKey === 'submissions') {
      rows.sort(
        (a, b) =>
          b.task_scores.reduce((x, t) => x + t.submission_count, 0) -
          a.task_scores.reduce((x, t) => x + t.submission_count, 0),
      )
    }
    return rows
  }, [filtered, sortKey, activeTaskTab])

  function handleExportCsv() {
    const csv = toCsv(sorted)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `leaderboard-${contestId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (isLoading) {
    return <div className="p-lg text-sm text-on-surface-variant">Loading leaderboard…</div>
  }

  const taskTabCount = Math.max(...data.map((r) => r.task_scores.length), 0)
  const staleMs = Date.now() - (dataUpdatedAt || Date.now())
  const isPotentiallyFrozen = staleMs > 5 * 60 * 1000

  return (
    <div className="p-lg bg-gradient-to-b from-primary-container/5 to-transparent rounded-xl">
      <div className="mb-md flex flex-wrap items-center justify-between gap-sm">
        <div>
          <h1 className="text-2xl font-bold text-on-surface mb-xs">Leaderboard</h1>
          <p className="text-sm text-on-surface-variant">Contest #{contestId}</p>
        </div>
        <span className="text-xs px-xs py-[2px] rounded border border-secondary/30 bg-secondary/10 text-secondary uppercase tracking-wider">
          Live ranking
        </span>
      </div>

      {isPotentiallyFrozen && (
        <div className="mb-sm text-xs px-sm py-xs rounded border border-amber-400/30 bg-amber-500/10 text-amber-300 uppercase tracking-wider">
          Frozen view: no updates in the last 5 minutes
        </div>
      )}

      <LeaderboardSearchAndExportBar
        search={search}
        onSearchChange={setSearch}
        onExportCsv={handleExportCsv}
        updatedLabel={dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : 'just now'}
      />

      <div className="mb-sm flex flex-wrap gap-xs">
        <button
          type="button"
          onClick={() => setActiveTaskTab(-1)}
          className={`px-sm py-xs rounded text-xs border ${activeTaskTab === -1 ? 'border-primary text-primary bg-primary-container/10' : 'border-outline-variant text-on-surface-variant'}`}
        >
          Overall
        </button>
        {Array.from({ length: taskTabCount }).map((_, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => setActiveTaskTab(idx)}
            className={`px-sm py-xs rounded text-xs border ${activeTaskTab === idx ? 'border-primary text-primary bg-primary-container/10' : 'border-outline-variant text-on-surface-variant'}`}
          >
            Task {idx + 1}
          </button>
        ))}
      </div>

      {sorted.length === 0 ? (
        <div className="bg-surface-container border border-outline-variant rounded-lg p-lg text-sm text-on-surface-variant text-center">
          No leaderboard entries yet.
        </div>
      ) : (
        <LeaderboardTableWithRankHighlightAndSort
          rows={sorted}
          sortKey={sortKey}
          onSortKeyChange={setSortKey}
        />
      )}
    </div>
  )
}
