// AdminSidebarNav — fixed left sidebar for admin pages
// Shows judge queue, submissions, participants, settings — per Stitch admin-dashboard.html
import { Link, NavLink } from 'react-router-dom'
import { cn } from '@/lib/cn'
import { useParams } from 'react-router-dom'

function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex items-center gap-sm px-sm py-xs rounded text-sm transition-colors',
    isActive
      ? 'text-primary bg-primary-container/10 font-medium'
      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container',
  )
}

export function AdminSidebarNav() {
  const { contestId } = useParams<{ contestId: string }>()
  const safeContestId = contestId ?? ''
  const hasContestId = Boolean(contestId)
  const base = `/admin/contests/${safeContestId}`

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-surface-container-low border-r border-outline-variant flex flex-col py-md px-sm gap-xs z-40">
      <Link to="/" className="px-sm py-xs text-primary font-bold text-lg mb-sm">
        OLPAI Admin
      </Link>
      <div className="border-t border-outline-variant mb-xs" />
      <NavLink to="/admin/contests/new" className={navLinkClass}>
        ➕ New Contest
      </NavLink>
      {hasContestId && (
        <>
          <NavLink to={`${base}/judge-queue`} className={navLinkClass}>
            📊 Judge Queue
          </NavLink>
          <NavLink to={`${base}/submissions`} className={navLinkClass}>
            📋 Submissions
          </NavLink>
          <NavLink to={`${base}/participants`} className={navLinkClass}>
            👥 Participants
          </NavLink>
          <NavLink to={`${base}/clarifications`} className={navLinkClass}>
            ❓ Clarifications
          </NavLink>
          <NavLink to={`${base}/settings`} className={navLinkClass}>
            ⚙️ Settings
          </NavLink>
        </>
      )}
    </aside>
  )
}
