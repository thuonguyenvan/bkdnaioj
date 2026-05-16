// HomePage — hero section + platform stats + contest list fetched from /api/v1/contests
import { Button } from '@/components/ui/button'
import { PlatformStatsSection } from '@/components/contest/platform-stats-section-four-cards'
import { ContestListSection } from '@/components/contest/contest-list-section-with-skeleton-and-empty-state'
import { useContests } from '@/hooks/use-contests-query'
import type { Contest } from '@/types/api-types'

function deriveStats(contests: Contest[]) {
  const active = contests.filter((c) => c.status === 'running' || c.status === 'published').length
  return [
    { value: '1,200+', label: 'Submissions', color: 'secondary' as const },
    { value: '150+', label: 'Teams', color: 'primary' as const },
    { value: '45', label: 'Tasks', color: 'secondary' as const },
    { value: String(active || 0), label: 'Active Contests', color: 'primary' as const },
  ]
}

export function HomePage() {
  const { data: contests = [], isLoading } = useContests()
  const stats = deriveStats(contests)
  const liveContest = contests.find((c) => c.status === 'running' || c.status === 'published')

  return (
    <div className="w-full max-w-[1440px] mx-auto px-lg pb-xxl bg-[radial-gradient(circle_at_top_left,rgba(79,70,229,0.15),transparent_40%),radial-gradient(circle_at_bottom_right,rgba(76,215,246,0.1),transparent_40%)]">
      <section className="py-xxl flex flex-col items-center text-center max-w-4xl mx-auto space-y-lg mt-xl">
        <h1 className="text-5xl md:text-6xl font-bold text-on-surface tracking-tight">
          Olympic AI Platform
        </h1>
        <p className="text-on-surface-variant text-xl max-w-2xl">
          Organize, compete, and practice AI challenges — automated judging, real-time leaderboards
        </p>
      </section>

      <PlatformStatsSection stats={stats} />

      {liveContest && (
        <section className="mb-xxl">
          <div className="bg-surface-container relative overflow-hidden border border-outline-variant rounded-xl p-xl flex flex-col md:flex-row justify-between items-center gap-lg">
            <div className="absolute inset-0 bg-gradient-to-r from-primary-container/10 to-transparent pointer-events-none" />
            <div className="relative z-10 flex flex-col gap-sm">
              <div className="flex items-center gap-sm text-error text-xs font-semibold uppercase tracking-wider">
                <span className="h-2.5 w-2.5 rounded-full bg-error animate-pulse" /> LIVE
              </div>
              <h2 className="text-2xl font-semibold text-on-surface">{liveContest.title}</h2>
              <p className="text-on-surface-variant">The main event is currently running. Submit your models before the deadline.</p>
            </div>
            <div className="relative z-10 flex flex-col items-end gap-md w-full md:w-auto">
              <div className="font-mono text-secondary bg-surface-container-high px-md py-sm rounded-lg border border-outline-variant">
                Ends {new Date(liveContest.end_time).toLocaleDateString()}
              </div>
              <a href="#contest-list" className="w-full md:w-auto">
                <Button variant="primary" size="lg" className="w-full">Join Now</Button>
              </a>
            </div>
          </div>
        </section>
      )}

      <ContestListSection contests={contests} isLoading={isLoading} />

      <footer className="mt-xxl border-t border-outline-variant py-lg flex flex-col md:flex-row justify-between items-center gap-md text-sm text-on-surface-variant">
        <div>© 2026 OLPAI. All rights reserved.</div>
        <div className="flex gap-lg">
          <a href="#" className="hover:text-primary transition-colors">Terms</a>
          <a href="#" className="hover:text-primary transition-colors">Privacy</a>
          <a href="#" className="hover:text-primary transition-colors">Contact</a>
        </div>
      </footer>
    </div>
  )
}
