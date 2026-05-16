import { cn } from '@/lib/cn'
import type { Clarification } from '@/types/api-types'

interface ClarificationMessageThreadViewProps {
  thread: Clarification | null
}

export function ClarificationMessageThreadViewWithBubbles({
  thread,
}: ClarificationMessageThreadViewProps) {
  if (!thread) {
    return (
      <div className="flex-1 flex items-center justify-center text-sm text-on-surface-variant">
        Select a thread to view messages.
      </div>
    )
  }

  const hasJuryReply = thread.messages.some((m) => m.is_jury)

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <header className="border-b border-outline-variant p-md bg-surface-container">
        <div className="flex items-center gap-sm">
          <h2 className="text-base font-semibold text-on-surface truncate">{thread.subject}</h2>
          <span
            className={cn(
              'text-xs px-xs py-[2px] rounded border',
              thread.status === 'closed'
                ? 'text-error border-error/30 bg-error/10'
                : 'text-secondary border-secondary/30 bg-secondary/10',
            )}
          >
            {thread.status.toUpperCase()}
          </span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-md space-y-sm bg-background bg-[radial-gradient(circle_at_top,rgba(79,70,229,0.06),transparent_45%)]">
        {thread.messages.map((m) => (
          <div
            key={m.id}
            className={cn('flex', m.is_jury ? 'justify-start' : 'justify-end')}
          >
            <div
              className={cn(
                'max-w-[75%] rounded-xl px-md py-sm border shadow-sm',
                m.is_jury
                  ? 'bg-surface-container border-outline-variant text-on-surface-variant'
                  : 'bg-primary-container/20 border-primary/30 text-on-surface',
              )}
            >
              <p className="text-sm whitespace-pre-wrap">{m.body}</p>
              <p className="text-xs mt-xs opacity-70">
                {m.author_name} • {new Date(m.created_at).toLocaleString()}
              </p>
            </div>
          </div>
        ))}

        {!hasJuryReply && (
          <p className="text-xs text-on-surface-variant text-center mt-md">
            Awaiting jury response...
          </p>
        )}
      </div>
    </div>
  )
}
