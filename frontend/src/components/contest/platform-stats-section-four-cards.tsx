// Platform stats section — 4 stat cards derived from contest list data
// Layout: 2-col on mobile, 4-col on desktop
import { cn } from '@/lib/cn'

interface StatItem {
  value: string
  label: string
  color: 'primary' | 'secondary'
}

interface PlatformStatsSectionProps {
  stats: StatItem[]
  className?: string
}

export function PlatformStatsSection({ stats, className }: PlatformStatsSectionProps) {
  return (
    <section className={cn('grid grid-cols-2 md:grid-cols-4 gap-md mb-xxl', className)}>
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-surface-container-low border border-surface-container-high p-lg rounded-lg text-center shadow-sm hover:border-outline-variant transition-colors"
        >
          <div
            className={cn(
              'font-mono text-2xl font-bold mb-xs',
              s.color === 'secondary' ? 'text-secondary' : 'text-primary',
            )}
          >
            {s.value}
          </div>
          <div className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider">
            {s.label}
          </div>
        </div>
      ))}
    </section>
  )
}
