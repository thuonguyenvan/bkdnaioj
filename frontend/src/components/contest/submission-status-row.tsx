// SubmissionStatusRow molecule — table row for recent submissions list
// ID and score use JetBrains Mono per OLPAI design; status uses StatusBadge
import { cn } from '@/lib/cn'
import { StatusBadge } from '@/components/ui/status-badge'
import type { Submission } from '@/types/api-types'
import { formatDistanceToNow } from 'date-fns'

interface SubmissionStatusRowProps {
  submission: Submission
  className?: string
}

export function SubmissionStatusRow({ submission, className }: SubmissionStatusRowProps) {
  return (
    <tr className={cn('border-b border-outline-variant hover:bg-surface-container-high/50 transition-colors', className)}>
      <td className="py-xs px-sm font-mono text-sm text-primary">
        #{submission.id.slice(0, 8)}
      </td>
      <td className="py-xs px-sm text-sm text-on-surface-variant">
        {formatDistanceToNow(new Date(submission.created_at), { addSuffix: true })}
      </td>
      <td className="py-xs px-sm font-mono text-sm text-secondary">
        {submission.score != null ? submission.score.toFixed(4) : '—'}
      </td>
      <td className="py-xs px-sm">
        <StatusBadge status={submission.status} />
      </td>
    </tr>
  )
}
