// TabBar molecule — horizontal tabs with underline active indicator
// Used in: contest detail (Overview/Tasks/Leaderboard/Announcements), leaderboard (Overall/Task A/B/C)
import { cn } from '@/lib/cn'

export interface Tab {
  id: string
  label: string
  badge?: number
}

interface TabBarProps {
  tabs: Tab[]
  activeTab: string
  onTabChange: (id: string) => void
  className?: string
}

export function TabBar({ tabs, activeTab, onTabChange, className }: TabBarProps) {
  return (
    <div className={cn('flex border-b border-outline-variant', className)}>
      {tabs.map(tab => (
        <button
          key={tab.id}
          type="button"
          onClick={() => onTabChange(tab.id)}
          className={cn(
            'px-md py-sm text-sm font-semibold transition-colors relative whitespace-nowrap',
            activeTab === tab.id
              ? 'text-primary border-b-2 border-primary -mb-px'
              : 'text-on-surface-variant hover:text-on-surface',
          )}
        >
          {tab.label}
          {tab.badge != null && tab.badge > 0 && (
            <span className="ml-xs bg-primary-container text-white text-xs px-xs py-[1px] rounded-full">
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
