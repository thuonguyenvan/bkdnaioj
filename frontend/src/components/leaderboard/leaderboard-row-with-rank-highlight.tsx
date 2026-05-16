// LeaderboardRow molecule — table row with gold/silver/bronze bg tints for top 3 ranks
// Rank uses data-lg (xl mono) for top 3, data-mono (sm) for rest — per OLPAI Stitch design
import { cn } from '@/lib/cn'

interface LeaderboardRowProps {
  rank: number
  teamName: string
  totalScore: number
  taskScores: number[]
  submissionCount: number
  lastSubmitAgo: string
  isCurrentUser?: boolean
}

/** Rank 1 = amber, rank 2 = slate, rank 3 = orange, rest = alternating rows */
function rankBgClass(rank: number): string {
  if (rank === 1) return 'bg-amber-500/10 border-l-2 border-amber-400'
  if (rank === 2) return 'bg-slate-400/10 border-l-2 border-slate-300'
  if (rank === 3) return 'bg-orange-600/10 border-l-2 border-orange-500'
  return rank % 2 === 0 ? 'bg-surface-container/50' : ''
}

export function LeaderboardRow({
  rank,
  teamName,
  totalScore,
  taskScores,
  submissionCount,
  lastSubmitAgo,
  isCurrentUser = false,
}: LeaderboardRowProps) {
  const isTop3 = rank <= 3
  return (
    <tr className={cn(rankBgClass(rank), isCurrentUser && 'ring-1 ring-inset ring-primary')}>
      <td className="py-sm px-md">
        <span
          className={cn(
            'font-mono font-semibold',
            isTop3 ? 'text-xl text-on-surface drop-shadow-[0_0_8px_rgba(255,255,255,0.15)]' : 'text-sm text-on-surface-variant',
          )}
        >
          {rank}
        </span>
      </td>
      <td className="py-sm px-md text-sm font-semibold text-on-surface">{teamName}</td>
      <td className="py-sm px-md font-mono text-sm text-secondary font-semibold">
        {totalScore.toFixed(4)}
      </td>
      {taskScores.map((score, i) => (
        <td key={i} className="py-sm px-md font-mono text-sm text-on-surface-variant">
          {score.toFixed(4)}
        </td>
      ))}
      <td className="py-sm px-md text-sm text-on-surface-variant">{submissionCount}</td>
      <td className="py-sm px-md text-sm text-on-surface-variant">{lastSubmitAgo}</td>
    </tr>
  )
}
