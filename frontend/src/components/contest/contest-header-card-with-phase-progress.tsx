// Contest header card — title, status badges, timeline progress, and CTA actions
import { Button } from '@/components/ui/button'
import { ProgressBar } from '@/components/ui/progress-bar-with-glow-animation'
import type { Contest } from '@/types/api-types'

interface ContestHeaderCardProps {
  contest: Contest
  taskCount: number
  isJoined: boolean
  onJoin: () => void
  onOpenLeaderboard: () => void
}

function getTimeProgress(startIso: string, endIso: string): number {
  const now = Date.now()
  const start = new Date(startIso).getTime()
  const end = new Date(endIso).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return 0
  return Math.max(0, Math.min(100, ((now - start) / (end - start)) * 100))
}

export function ContestHeaderCardWithPhaseProgress({
  contest,
  taskCount,
  isJoined,
  onJoin,
  onOpenLeaderboard,
}: ContestHeaderCardProps) {
  const progress = getTimeProgress(contest.start_time, contest.end_time)
  const isLive = contest.status === 'published' || contest.status === 'running'

  return (
    <section className="relative overflow-hidden bg-surface-container border border-outline-variant rounded-xl p-xl mb-lg shadow-[0_0_20px_rgba(79,70,229,0.18)]">
      <div className="absolute inset-0 bg-gradient-to-r from-primary-container/10 to-transparent pointer-events-none" />
      <div className="relative flex flex-col gap-lg">
        <div>
          <h1 className="text-3xl font-bold text-on-surface tracking-tight">{contest.title}</h1>
          <p className="text-secondary mt-xs">AI Contest</p>
        </div>

        <div className="flex flex-wrap items-center gap-sm text-xs">
          <span className={isLive ? 'text-green-400' : 'text-on-surface-variant'}>
            {isLive ? 'LIVE' : contest.status.toUpperCase()}
          </span>
          <span className="text-on-surface-variant">•</span>
          <span className="text-on-surface-variant">{taskCount} Tasks</span>
          <span className="text-on-surface-variant">•</span>
          <span className="text-on-surface-variant">Max {contest.max_team_size}/team</span>
        </div>

        <div>
          <div className="text-xs text-on-surface-variant mb-xs">
            {new Date(contest.start_time).toLocaleDateString()} → {new Date(contest.end_time).toLocaleDateString()}
          </div>
          <ProgressBar value={progress} isRunning={isLive} />
        </div>

        <div className="flex flex-wrap gap-sm">
          {!isJoined ? (
            <Button onClick={onJoin} variant="primary" size="md">Join Contest</Button>
          ) : (
            <span className="px-md py-sm rounded bg-green-500/10 text-green-400 text-sm font-semibold">Enrolled</span>
          )}
          <Button onClick={onOpenLeaderboard} variant="outline" size="md">View Leaderboard</Button>
        </div>
      </div>
    </section>
  )
}
