// Contest list section — maps API contests to ContestCard grid with loading skeleton and empty state
import { Link } from 'react-router-dom'
import { ContestCard } from '@/components/contest/contest-card'
import type { Contest } from '@/types/api-types'

function SkeletonCard() {
  return (
    <div className="bg-surface-container border border-outline-variant rounded-xl p-md flex flex-col gap-sm animate-pulse">
      <div className="h-4 bg-surface-container-high rounded w-3/4" />
      <div className="h-3 bg-surface-container-high rounded w-full" />
      <div className="h-3 bg-surface-container-high rounded w-1/2" />
      <div className="h-8 bg-surface-container-high rounded mt-auto" />
    </div>
  )
}

interface ContestListSectionProps {
  contests: Contest[]
  isLoading: boolean
}

export function ContestListSection({ contests, isLoading }: ContestListSectionProps) {
  return (
    <section className="mb-xxl mt-xl" id="contest-list">
      <div className="flex justify-between items-end mb-lg">
        <h3 className="font-bold text-xl text-on-surface border-b-2 border-outline-variant pb-xs">
          Upcoming &amp; Recent Contests
        </h3>
        <Link
          to="/contests"
          className="text-sm text-secondary hover:text-primary transition-colors flex items-center gap-xs"
        >
          View All <span aria-hidden>→</span>
        </Link>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-lg">
          {[1, 2, 3].map((n) => <SkeletonCard key={n} />)}
        </div>
      )}

      {!isLoading && contests.length === 0 && (
        <div className="text-center py-xxl text-on-surface-variant text-sm">
          No contests available yet.
        </div>
      )}

      {!isLoading && contests.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-lg">
          {contests.map((c) => (
            <ContestCard key={c.id} contest={c} />
          ))}
        </div>
      )}
    </section>
  )
}
