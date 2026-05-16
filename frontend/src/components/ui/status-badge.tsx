// StatusBadge atom — submission/judging status with 6px dot indicator
// Used in: submission table, admin judge queue, contest detail
import { cn } from '@/lib/cn'
import type { SubmissionStatus } from '@/types/api-types'

const STATUS_CONFIG: Record<
  SubmissionStatus,
  { label: string; bg: string; text: string; dot: string }
> = {
  accepted:     { label: 'Accepted',     bg: 'bg-green-500/10', text: 'text-green-400',          dot: 'bg-green-400' },
  wrong_answer: { label: 'Wrong Answer', bg: 'bg-error/10',     text: 'text-error',              dot: 'bg-error' },
  pending:      { label: 'Pending',      bg: 'bg-outline/10',   text: 'text-on-surface-variant', dot: 'bg-outline' },
  running:      { label: 'Running',      bg: 'bg-secondary/10', text: 'text-secondary',          dot: 'bg-secondary animate-pulse' },
  error:        { label: 'Error',        bg: 'bg-error/10',     text: 'text-error',              dot: 'bg-error' },
  time_limit:   { label: 'Time Limit',   bg: 'bg-tertiary/10',  text: 'text-tertiary',           dot: 'bg-tertiary' },
}

interface StatusBadgeProps {
  status: SubmissionStatus
  className?: string
}

/** Inline badge with 6px dot indicator. Dot pulses for 'running' state. */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const cfg = STATUS_CONFIG[status]
  return (
    <span
      className={cn(
        'inline-flex items-center gap-xs px-sm py-xs rounded text-xs font-semibold',
        cfg.bg,
        cfg.text,
        className,
      )}
    >
      <span className={cn('w-[6px] h-[6px] rounded-full shrink-0', cfg.dot)} />
      {cfg.label}
    </span>
  )
}
