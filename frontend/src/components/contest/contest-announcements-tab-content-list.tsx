// Contest announcements tab — list of announcement items
import { AnnouncementItem } from '@/components/shared/announcement-item'
import type { Announcement } from '@/types/api-types'

interface ContestAnnouncementsTabContentProps {
  announcements: Announcement[]
}

export function ContestAnnouncementsTabContentList({
  announcements,
}: ContestAnnouncementsTabContentProps) {
  if (announcements.length === 0) {
    return <div className="py-lg text-sm text-on-surface-variant">No announcements yet.</div>
  }

  return (
    <div className="bg-surface-container border border-outline-variant rounded-lg px-lg">
      {announcements.map((a) => (
        <AnnouncementItem
          key={a.id}
          title={a.title}
          body={a.body}
          createdAt={a.created_at}
        />
      ))}
    </div>
  )
}
