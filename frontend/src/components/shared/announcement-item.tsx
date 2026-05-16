// AnnouncementItem molecule — contest announcement with title + timestamp + body
// Used in: contest detail Announcements tab
import { cn } from '@/lib/cn'
import { formatDistanceToNow } from 'date-fns'

interface AnnouncementItemProps {
  title: string
  body: string
  createdAt: string
  className?: string
}

export function AnnouncementItem({ title, body, createdAt, className }: AnnouncementItemProps) {
  return (
    <div className={cn('border-b border-outline-variant py-md last:border-b-0', className)}>
      <div className="flex items-start justify-between gap-md mb-xs">
        <h4 className="text-sm font-semibold text-on-surface">{title}</h4>
        <span className="text-xs text-on-surface-variant shrink-0">
          {formatDistanceToNow(new Date(createdAt), { addSuffix: true })}
        </span>
      </div>
      <p className="text-sm text-on-surface-variant leading-relaxed">{body}</p>
    </div>
  )
}
