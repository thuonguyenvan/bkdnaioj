// Leaderboard table with sortable score/submission columns
import { LeaderboardRow } from '@/components/leaderboard/leaderboard-row-with-rank-highlight'
import type { LeaderboardEntry } from '@/types/api-types'

export type SortKey = 'rank' | 'score' | 'submissions'

interface LeaderboardTableProps {
  rows: LeaderboardEntry[]
  sortKey: SortKey
  onSortKeyChange: (key: SortKey) => void
}

export function LeaderboardTableWithRankHighlightAndSort({
  rows,
  sortKey,
  onSortKeyChange,
}: LeaderboardTableProps) {
  return (
    <div className="overflow-x-auto bg-surface-container border border-outline-variant rounded-lg">
      <table className="w-full min-w-[860px]">
        <thead className="sticky top-0 bg-surface-container-high border-b border-outline-variant">
          <tr className="text-left text-xs text-on-surface-variant">
            <th className="py-sm px-md cursor-pointer" onClick={() => onSortKeyChange('rank')}>Rank {sortKey === 'rank' ? '↓' : ''}</th>
            <th className="py-sm px-md">Team</th>
            <th className="py-sm px-md cursor-pointer" onClick={() => onSortKeyChange('score')}>Score {sortKey === 'score' ? '↓' : ''}</th>
            <th className="py-sm px-md">Task Scores</th>
            <th className="py-sm px-md cursor-pointer" onClick={() => onSortKeyChange('submissions')}>Submissions {sortKey === 'submissions' ? '↓' : ''}</th>
            <th className="py-sm px-md">Last Submit</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <LeaderboardRow
              key={row.team_id}
              rank={row.rank}
              teamName={row.team_name}
              totalScore={row.total_score}
              taskScores={row.task_scores.map((t) => t.best_score)}
              submissionCount={row.task_scores.reduce((a, t) => a + t.submission_count, 0)}
              lastSubmitAgo={new Date(row.last_submission_at).toLocaleString()}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}
