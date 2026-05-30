// ContestCard molecule — contest summary card for homepage listing
// Shows title, status badge with dot, metadata, and link to contest detail
import { cn } from '@/lib/cn'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import type { Contest } from '@/types/api-types'

const STATUS_STYLE: Record<string, { label: string; dot: string; text: string }> = {
  published:          { label: 'LIVE',        dot: 'bg-green-400 animate-pulse', text: 'text-green-400' },
  running:            { label: 'LIVE',        dot: 'bg-green-400 animate-pulse', text: 'text-green-400' },
  registration_open:  { label: 'UPCOMING',    dot: 'bg-outline',                 text: 'text-on-surface-variant' },
  draft:              { label: 'UPCOMING',    dot: 'bg-outline',                 text: 'text-on-surface-variant' },
  ended:              { label: 'ENDED',       dot: 'bg-error',                   text: 'text-error' },
  archived:           { label: 'ENDED',       dot: 'bg-error',                   text: 'text-error' },
}

const FALLBACK_STATUS_STYLE = {
  label: 'UNKNOWN',
  dot: 'bg-outline',
  text: 'text-on-surface-variant',
}

interface ContestCardProps {
  contest: Contest
  teamCount?: number
  taskCount?: number
  className?: string
}

export function ContestCard({ contest, teamCount, taskCount, className }: ContestCardProps) {
  const s = STATUS_STYLE[contest.status] ?? FALLBACK_STATUS_STYLE
  return (
    <div
      className={cn(
        'bg-surface-container-low border border-surface-container-high rounded-xl p-md flex flex-col gap-sm hover:border-outline-variant transition-colors group',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-sm">
        <h3 className="font-semibold text-on-surface leading-snug group-hover:text-primary transition-colors">{contest.title}</h3>
        <span className={cn('inline-flex items-center gap-xs text-xs font-bold shrink-0', s.text)}>
          <span className={cn('w-[6px] h-[6px] rounded-full', s.dot)} />
          {s.label}
        </span>
      </div>

      {contest.short_description && (
        <p className="text-sm text-on-surface-variant line-clamp-2">
          {contest.short_description}
        </p>
      )}

      <div className="text-xs text-on-surface-variant flex items-center gap-xs">
        <span>🗓</span>
        <span>
          {new Date(contest.start_time).toLocaleDateString()} - {new Date(contest.end_time).toLocaleDateString()}
        </span>
      </div>

      <div className="mt-auto pt-sm border-t border-surface-container-high flex justify-between items-center gap-md text-xs text-on-surface-variant font-mono">
        <span className="flex items-center gap-xs">📋 {taskCount != null ? taskCount : '—'} Tasks</span>
        <span className="flex items-center gap-xs">👥 {teamCount != null ? teamCount : '—'} Teams</span>
      </div>

      <Link to={`/contests/${contest.id}`} className="mt-auto">
        <Button variant="primary" size="sm" className="w-full">
          View Contest
        </Button>
      </Link>
    </div>
  )
}
