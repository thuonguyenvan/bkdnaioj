// ContestSidebarNav — fixed left sidebar (w-64) for contest pages
// Lists contest tasks + Leaderboard/Clarifications/Overview links — per Stitch contest-detail.html
import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/cn'
import type { Task } from '@/types/api-types'

interface ContestSidebarNavProps {
  contestId: string
  contestTitle: string
  tasks: Task[]
}

function navLinkClass({ isActive }: { isActive: boolean }) {
  return cn(
    'flex items-center gap-sm px-sm py-xs rounded text-sm transition-colors',
    isActive
      ? 'text-primary bg-primary-container/10 font-medium'
      : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container',
  )
}

export function ContestSidebarNav({ contestId, contestTitle, tasks }: ContestSidebarNavProps) {
  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-surface-container-low border-r border-outline-variant flex flex-col py-md px-sm gap-xs z-40 overflow-y-auto">
      {/* Contest name */}
      <div className="px-sm pt-xs pb-md border-b border-outline-variant mb-xs">
        <p className="text-xs text-outline font-bold uppercase tracking-widest mb-xs">Contest</p>
        <p className="text-secondary font-semibold text-sm truncate">{contestTitle}</p>
      </div>

      {/* Tasks */}
      {tasks.length > 0 && (
        <>
          <p className="text-xs text-outline font-bold uppercase tracking-widest px-sm mt-xs">Tasks</p>
          {tasks.map(task => (
            <NavLink
              key={task.id}
              to={`/contests/${contestId}/tasks/${task.id}/submit`}
              className={navLinkClass}
            >
              {task.title}
            </NavLink>
          ))}
        </>
      )}

      {/* Section divider */}
      <div className="border-t border-outline-variant my-xs" />

      {/* Navigation */}
      <NavLink to={`/contests/${contestId}`} end className={navLinkClass}>
        Overview
      </NavLink>
      <NavLink to={`/contests/${contestId}/leaderboard`} className={navLinkClass}>
        Leaderboard
      </NavLink>
      <NavLink to={`/contests/${contestId}/clarifications`} className={navLinkClass}>
        Clarifications
      </NavLink>
    </aside>
  )
}
