// Submission metric card — display scoring metric name and description
import type { Task } from '@/types/api-types'

interface SubmissionEvaluationMetricCardProps {
  task: Task
}

export function SubmissionEvaluationMetricCard({ task }: SubmissionEvaluationMetricCardProps) {
  return (
    <section className="bg-surface-container border border-outline-variant rounded-lg p-lg">
      <h3 className="text-lg font-semibold text-on-surface mb-sm border-b border-outline-variant pb-xs">Evaluation Metric</h3>
      <p className="text-sm text-on-surface"><span className="font-semibold text-secondary">{task.metric_name}</span></p>
      <p className="text-sm text-on-surface-variant mt-xs">{task.metric_description}</p>
    </section>
  )
}
