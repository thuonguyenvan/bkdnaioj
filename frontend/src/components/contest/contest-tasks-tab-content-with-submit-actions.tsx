// Contest tasks tab — list tasks with metric summary and submit actions
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import type { Task } from '@/types/api-types'

interface ContestTasksTabContentProps {
  contestId: string
  tasks: Task[]
}

export function ContestTasksTabContentWithSubmitActions({
  contestId,
  tasks,
}: ContestTasksTabContentProps) {
  if (tasks.length === 0) {
    return <div className="py-lg text-sm text-on-surface-variant">No tasks found.</div>
  }

  return (
    <div className="space-y-sm py-md">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="bg-surface-container-low border border-surface-container-high rounded-lg p-md flex items-start justify-between gap-md hover:border-outline-variant transition-colors"
        >
          <div>
            <h4 className="font-semibold text-on-surface">{task.title}</h4>
            <p className="text-sm text-on-surface-variant mt-xs">{task.metric_name}: {task.metric_description}</p>
            <p className="text-xs text-outline mt-xs">Limit: {task.submission_limit_per_day}/day</p>
          </div>
          <Link to={`/contests/${contestId}/tasks/${task.id}/submit`}>
            <Button size="sm" variant="primary">Submit</Button>
          </Link>
        </div>
      ))}
    </div>
  )
}
