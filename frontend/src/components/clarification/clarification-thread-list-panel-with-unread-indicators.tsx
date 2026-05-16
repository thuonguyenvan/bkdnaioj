import { cn } from '@/lib/cn'
import type { Clarification } from '@/types/api-types'

interface ClarificationThreadListPanelProps {
  threads: Clarification[]
  activeId: string | null
  onSelect: (id: string) => void
  onNewQuestion: () => void
}

export function ClarificationThreadListPanelWithUnreadIndicators({
  threads,
  activeId,
  onSelect,
  onNewQuestion,
}: ClarificationThreadListPanelProps) {
  return (
    <aside className="w-full md:w-[320px] border-r border-outline-variant bg-surface-container-low p-md flex flex-col gap-sm">
      <div className="text-xs uppercase tracking-wider text-on-surface-variant font-semibold border-b border-outline-variant pb-xs">Clarifications</div>
      <div className="flex-1 overflow-y-auto space-y-xs">
        {threads.map((t) => {
          const isActive = t.id === activeId
          const hasUnread = t.unread_count > 0
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => onSelect(t.id)}
              className={cn(
                'w-full text-left rounded p-sm border transition-colors',
                isActive
                  ? 'bg-primary-container/10 border-primary/40'
                  : 'bg-surface-container border-outline-variant hover:border-outline',
              )}
            >
              <div className="flex items-center justify-between gap-sm">
                <p className="text-sm font-medium text-on-surface truncate">{t.subject}</p>
                {hasUnread && <span className="h-2 w-2 rounded-full bg-error shrink-0" />}
              </div>
              <p className="text-xs text-on-surface-variant mt-xs truncate">
                {new Date(t.created_at).toLocaleString()} • {t.status}
              </p>
            </button>
          )
        })}
      </div>
      <button
        type="button"
        onClick={onNewQuestion}
        className="text-sm px-sm py-xs rounded border border-outline-variant text-on-surface-variant hover:text-on-surface hover:bg-surface-container"
      >
        + New Question
      </button>
    </aside>
  )
}
