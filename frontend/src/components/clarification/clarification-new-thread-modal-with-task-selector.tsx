import type { Task } from '@/types/api-types'

interface ClarificationNewThreadModalProps {
  open: boolean
  subject: string
  body: string
  taskId: string
  tasks: Task[]
  onSubjectChange: (v: string) => void
  onBodyChange: (v: string) => void
  onTaskChange: (v: string) => void
  onClose: () => void
  onSubmit: () => void
  isSubmitting?: boolean
}

export function ClarificationNewThreadModalWithTaskSelector({
  open,
  subject,
  body,
  taskId,
  tasks,
  onSubjectChange,
  onBodyChange,
  onTaskChange,
  onClose,
  onSubmit,
  isSubmitting = false,
}: ClarificationNewThreadModalProps) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-md">
      <div className="w-full max-w-lg rounded-lg border border-outline-variant bg-surface-container p-lg space-y-md">
        <h3 className="text-lg font-semibold text-on-surface">New Clarification</h3>
        <input
          value={subject}
          onChange={(e) => onSubjectChange(e.target.value)}
          placeholder="Subject"
          className="w-full bg-surface-container-lowest border border-outline-variant rounded px-md py-sm text-sm text-on-surface"
        />
        <select
          value={taskId}
          onChange={(e) => onTaskChange(e.target.value)}
          className="w-full bg-surface-container-lowest border border-outline-variant rounded px-md py-sm text-sm text-on-surface"
        >
          <option value="">General question</option>
          {tasks.map((t) => (
            <option key={t.id} value={t.id}>{t.title}</option>
          ))}
        </select>
        <textarea
          value={body}
          onChange={(e) => onBodyChange(e.target.value)}
          placeholder="Message"
          className="w-full min-h-[120px] bg-surface-container-lowest border border-outline-variant rounded px-md py-sm text-sm text-on-surface"
        />
        <div className="flex justify-end gap-sm">
          <button type="button" onClick={onClose} className="px-md py-sm rounded border border-outline-variant text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={isSubmitting || !subject.trim() || !body.trim()}
            className="px-md py-sm rounded bg-primary-container text-white text-sm font-semibold disabled:opacity-50"
          >
            {isSubmitting ? 'Creating...' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  )
}
