// Contest overview tab — description, metric/rules summary, and schedule details
import type { Contest } from '@/types/api-types'

interface ContestOverviewTabContentProps {
  contest: Contest
}

export function ContestOverviewTabContentWithDescriptionAndSchedule({
  contest,
}: ContestOverviewTabContentProps) {
  return (
    <div className="space-y-lg py-md">
      <section className="bg-surface-container border border-outline-variant rounded-lg p-lg">
        <h3 className="text-lg font-semibold text-on-surface mb-sm border-b border-outline-variant pb-xs">Overview</h3>
        <p className="text-sm text-on-surface-variant leading-relaxed">
          {contest.short_description || 'No description provided.'}
        </p>
      </section>

      <section className="bg-surface-container border border-outline-variant rounded-lg p-lg">
        <h3 className="text-lg font-semibold text-on-surface mb-sm">Schedule</h3>
        <div className="grid md:grid-cols-2 gap-md text-sm">
          <div>
            <p className="text-on-surface-variant">Start</p>
            <p className="text-on-surface">{new Date(contest.start_time).toLocaleString()}</p>
          </div>
          <div>
            <p className="text-on-surface-variant">End</p>
            <p className="text-on-surface">{new Date(contest.end_time).toLocaleString()}</p>
          </div>
        </div>
      </section>
    </div>
  )
}
